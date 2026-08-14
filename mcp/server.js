#!/usr/bin/env node
/**
 * FlowStack MCP server.
 *
 * Exposes the app's data as MCP tools so a Claude session can read and change
 * tasks, sprints, users and tags. Speaks JSON-RPC over stdio.
 *
 * It shares the domain rules in src/lib/domain/ with the app itself, so a task
 * created here is validated exactly as one created in the UI - same uuid rules,
 * same relationship resolution, same dangling-reference refusal.
 */

import { createInterface } from "node:readline";
import { SnapshotStore } from "./store.js";
import {
  newId,
  isUuid,
  resolveRelations,
  normalizeSubtasks,
  validateTask,
  createHistoryEntry,
  getChangedFields,
  points,
  findDanglingReferences,
} from "../src/lib/domain/entities.js";

const store = new SnapshotStore();

// --- access control --------------------------------------------------------

/**
 * Permissions live in the app's own settings, inside the snapshot this server
 * reads. The app is the authority: toggle a switch in Settings and the next
 * tool call here obeys it - no restart, no config file of our own.
 *
 * Read fresh every call so a toggle takes effect immediately.
 *
 * @param {"read"|"write"|"delete"} level
 */
function requireAccess(level) {
  let mcp;
  try {
    mcp = store.read().data?.settings?.mcp;
  } catch {
    mcp = undefined;
  }

  // No settings yet (fresh install, app never opened) - allow reads only, so a
  // misconfiguration can never mean unrestricted write access
  const cfg = mcp || { enabled: true, allowWrite: false, allowDelete: false };

  if (cfg.enabled === false) {
    throw new Error("MCP access is disabled in FlowStack (Settings > MCP access)");
  }
  if (level === "write" && !cfg.allowWrite) {
    throw new Error("MCP write access is off - enable it in FlowStack (Settings > MCP access)");
  }
  if (level === "delete" && !cfg.allowDelete) {
    throw new Error("MCP delete access is off - enable it in FlowStack (Settings > MCP access)");
  }
}

// --- helpers ---------------------------------------------------------------

const world = (d) => ({ users: d.users, tags: d.tags, sprints: d.sprints, statuses: d.statuses });

function findSprint(data, ref) {
  if (!ref) return null;
  return (
    data.sprints.find((s) => s.id === ref) ||
    data.sprints.find((s) => (s.name || "").toLowerCase() === String(ref).toLowerCase()) ||
    null
  );
}

/**
 * The project new work belongs to.
 *
 * The app marks it with `isActive` precisely so this process can see it -
 * the UI's own selection lives in localStorage, which no other process can
 * read. Falls back to the only/first project so a board that predates the
 * flag still behaves sensibly.
 */
function activeProject(data) {
  const rows = data.projects || [];
  return rows.find((p) => p.isActive) || rows[0] || null;
}

function findProject(data, ref) {
  if (!ref) return null;
  const rows = data.projects || [];
  return (
    rows.find((p) => p.id === ref) ||
    rows.find((p) => p.id.startsWith(ref)) ||
    rows.find((p) => (p.name || "").toLowerCase() === String(ref).toLowerCase()) ||
    null
  );
}

function findUser(data, ref) {
  if (!ref) return null;
  const full = (u) => `${u.name || ""} ${u.lastname || ""}`.trim().toLowerCase();
  return (
    data.users.find((u) => u.id === ref) ||
    data.users.find((u) => full(u) === String(ref).toLowerCase()) ||
    data.users.find((u) => (u.name || "").toLowerCase() === String(ref).toLowerCase()) ||
    null
  );
}

/** Tags are created on demand so a task never silently loses one. */
function ensureTags(data, names) {
  const out = [];
  for (const name of names || []) {
    const wanted = String(name).trim();
    if (!wanted) continue;
    let tag = data.tags.find((t) => (t.name || "").toLowerCase() === wanted.toLowerCase());
    if (!tag) {
      tag = { id: newId(), name: wanted, origin: "mcp", created: new Date().toISOString() };
      data.tags.push(tag);
    }
    out.push(tag.id);
  }
  return out;
}

/**
 * Find a task by full UUID or by the short prefix the compact listing prints.
 * Listings show 8 chars, so every tool that takes a task id must accept one -
 * otherwise ids you can see are ids you cannot use.
 */
function findTask(data, ref) {
  if (!ref) return null;
  const exact = data.tasks.find((t) => t.id === ref);
  if (exact) return exact;

  const matches = data.tasks.filter((t) => t.id.startsWith(ref));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`"${ref}" matches ${matches.length} tasks - use the full id`);
  }
  return null;
}

/**
 * Seconds on a task's clock right now, counting the in-flight session for a
 * running timer. Mirrors the app's arithmetic so both agree on the number.
 */
function liveElapsed(task) {
  const banked = task.elapsedSeconds || 0;
  if (!task.timerRunning || !task.timerStartedAt) return banked;
  const startedAt = new Date(task.timerStartedAt).getTime();
  return banked + Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

/** Stop a running timer and fold its session into elapsedSeconds. */
function bankElapsed(task) {
  if (!task.timerRunning) return 0;
  const before = task.elapsedSeconds || 0;
  const total = liveElapsed(task);
  task.elapsedSeconds = total;
  task.timerRunning = false;
  task.timerStartedAt = null;
  task.updated = new Date().toISOString();
  return total - before;
}

const formatElapsed = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
};

/** One line per task - the cheap listing format. */
const compactLine = (t, data) => [
  t.id.slice(0, 8),
  t.status,
  points(t) || "-",
  t.title,
  data.sprints.find((s) => s.id === t.sprintId)?.name || "backlog",
  t.asign || "-",
  [t.blocked && "BLOCKED", (t.subtasks || []).length && `${(t.subtasks || []).filter((x) => x.completed).length}/${t.subtasks.length}`]
    .filter(Boolean).join(" ") || "-",
].join(" | ");

const summarise = (t, data) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  points: points(t),
  sprint: data.sprints.find((s) => s.id === t.sprintId)?.name || null,
  assignee: t.asign || null,
  tags: t.tags || [],
  blocked: Boolean(t.blocked),
  subtasks: (t.subtasks || []).length,
});

// --- tools -----------------------------------------------------------------

const TOOLS = {
  list_tasks: {
    description:
      "List tasks, optionally filtered. Returns one compact line per task; pass verbose for full summary objects, or use get_task for one complete record.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Board column, e.g. READY" },
        sprint: { type: "string", description: "Sprint name or id, or 'backlog' for unassigned" },
        project: {
          type: "string",
          description: "Project name, id or short prefix. Omit for every project.",
        },
        archived: {
          type: "string",
          enum: ["exclude", "only", "include"],
          description:
            "Archived tasks are hidden on the board. 'exclude' (default) matches what the user sees, 'only' lists just the archived ones, 'include' returns both.",
        },
        assignee: { type: "string", description: "User name or id" },
        tag: { type: "string" },
        blocked: { type: "boolean" },
        search: { type: "string", description: "Case-insensitive match on title, description and acceptance criteria" },
        limit: { type: "number", description: "Max rows (default 50)" },
        verbose: { type: "boolean", description: "Full summary objects instead of compact lines" },
      },
    },
    run(args) {
      requireAccess("read");
      const { data } = store.read();
      let rows = data.tasks;
      // Mirror the board: archived work is out of sight unless asked for
      if (args.archived === "only") rows = rows.filter((t) => t.archived);
      else if (args.archived !== "include") rows = rows.filter((t) => !t.archived);
      if (args.project) {
        const project = findProject(data, args.project);
        if (!project) throw new Error(`no project matching "${args.project}"`);
        rows = rows.filter((t) => t.projectId === project.id);
      }
      if (args.status) rows = rows.filter((t) => t.status === args.status);
      if (args.sprint === "backlog") rows = rows.filter((t) => !t.sprintId);
      else if (args.sprint) {
        const s = findSprint(data, args.sprint);
        rows = s ? rows.filter((t) => t.sprintId === s.id) : [];
      }
      if (args.assignee) {
        const u = findUser(data, args.assignee);
        rows = u ? rows.filter((t) => t.assigneeId === u.id) : [];
      }
      if (args.tag) {
        const needle = args.tag.toLowerCase();
        rows = rows.filter((t) => (t.tags || []).some((x) => x.toLowerCase() === needle));
      }
      if (typeof args.blocked === "boolean") rows = rows.filter((t) => Boolean(t.blocked) === args.blocked);
      if (args.search) {
        const needle = args.search.toLowerCase();
        rows = rows.filter((t) =>
          [t.title, t.description, t.acceptance, t.epic]
            .some((f) => typeof f === "string" && f.toLowerCase().includes(needle))
        );
      }

      // Compact by default: a listing is for choosing what to look at, and one
      // line per task costs ~1/5 the tokens of a full summary object. At 500
      // tasks the object form alone would fill most of a context window.
      const limit = Number.isFinite(args.limit) ? args.limit : 50;
      const page = rows.slice(0, limit);
      const truncated = rows.length > page.length;

      if (args.verbose) {
        return { count: rows.length, shown: page.length, truncated, tasks: page.map((t) => summarise(t, data)) };
      }
      return {
        count: rows.length,
        shown: page.length,
        truncated,
        legend: "id | status | pts | title | sprint | assignee | flags",
        tasks: page.map((t) => compactLine(t, data)),
      };
    },
  },

  get_task: {
    description: "Full record for one task, including description, acceptance criteria and subtasks.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("read");
      const { data } = store.read();
      const task = findTask(data, args.id);
      if (!task) throw new Error(`no task with id ${args.id}`);
      return task;
    },
  },

  create_task: {
    description:
      "Create a task. Sprint and assignee accept a name or an id; unknown tags are created automatically.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
        type: { type: "string", enum: ["story", "bug", "task"] },
        points: { type: "string" },
        sprint: { type: "string" },
        assignee: { type: "string" },
        epic: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        acceptance: { type: "string" },
        subtasks: { type: "array", items: { type: "string" } },
        blocked: { type: "boolean" },
        blocker: { type: "string" },
      },
      required: ["title"],
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        const check = validateTask(args);
        if (!check.ok) throw new Error(check.error);

        const now = new Date().toISOString();
        const sprint = findSprint(data, args.sprint);
        const user = findUser(data, args.assignee);
        if (args.sprint && !sprint) throw new Error(`no sprint matching "${args.sprint}"`);
        if (args.assignee && !user) throw new Error(`no user matching "${args.assignee}"`);

        // A task in a sprint takes the sprint's project; otherwise it joins the
        // active one. A task with no project at all is unreachable in the
        // project-scoped views, so never leave it unset.
        const project = activeProject(data);
        const projectId = sprint?.projectId || project?.id || null;

        const task = {
          id: newId(),
          projectId,
          title: args.title.trim(),
          description: args.description || "",
          status: args.status || "BACKLOG",
          priority: args.priority || "medium",
          type: args.type || "story",
          points: args.points != null ? String(args.points) : "",
          epic: args.epic || "",
          acceptance: args.acceptance || "",
          blocked: Boolean(args.blocked),
          blocker: args.blocker || "",
          sprintId: sprint ? sprint.id : null,
          assigneeId: user ? user.id : null,
          tagIds: ensureTags(data, args.tags),
          subtasks: normalizeSubtasks((args.subtasks || []).map((text) => ({ text }))),
          origin: "mcp",
          created: now,
          updated: now,
          history: [createHistoryEntry("task", null, "created", "create")],
        };

        data.tasks.unshift(resolveRelations(task, world(data)));
        return data;
      });
      const created = snapshot.data.tasks[0];
      return { created: summarise(created, snapshot.data), id: created.id };
    },
  },

  update_task: {
    description: "Update fields on an existing task. Only the fields you pass are changed.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        points: { type: "string" },
        sprint: { type: "string", description: "Name, id, or 'backlog' to unassign" },
        assignee: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        blocked: { type: "boolean" },
        blocker: { type: "string" },
        acceptance: { type: "string" },
        epic: { type: "string" },
        type: { type: "string", enum: ["story", "bug", "task"] },
        time: { type: "string", description: "Time estimate, e.g. 3h or 2d" },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        const found = findTask(data, args.id);
        if (!found) throw new Error(`no task with id ${args.id}`);
        const idx = data.tasks.indexOf(found);
        const old = found;

        const updates = {};
        for (const f of ["title", "description", "status", "priority", "blocker", "acceptance", "epic", "type", "time"]) {
          if (args[f] !== undefined) updates[f] = args[f];
        }
        if (args.points !== undefined) updates.points = String(args.points);
        if (args.blocked !== undefined) updates.blocked = Boolean(args.blocked);

        if (args.sprint !== undefined) {
          if (args.sprint === "backlog" || args.sprint === null) updates.sprintId = null;
          else {
            const s = findSprint(data, args.sprint);
            if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
            updates.sprintId = s.id;
            // A task inside a sprint belongs to that sprint's project, so the
            // two can never disagree - the same rule the app enforces
            if (s.projectId) updates.projectId = s.projectId;
          }
        }
        if (args.assignee !== undefined) {
          if (!args.assignee) updates.assigneeId = null;
          else {
            const u = findUser(data, args.assignee);
            if (!u) throw new Error(`no user matching "${args.assignee}"`);
            updates.assigneeId = u.id;
          }
        }
        if (args.tags !== undefined) updates.tagIds = ensureTags(data, args.tags);

        const history = [...(old.history || []), ...getChangedFields(old, updates)];
        data.tasks[idx] = resolveRelations(
          { ...old, ...updates, updated: new Date().toISOString(), history },
          world(data)
        );
        return data;
      });
      const t = snapshot.data.tasks.find((x) => x.id === args.id);
      return { updated: summarise(t, snapshot.data) };
    },
  },

  delete_task: {
    description: "Delete a task. The previous state is backed up first and can be restored.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("delete");
      let removed = null;
      const { backup } = store.mutate((data) => {
        const found = findTask(data, args.id);
        if (!found) throw new Error(`no task with id ${args.id}`);
        removed = found;
        data.tasks.splice(data.tasks.indexOf(found), 1);
        return data;
      });
      return { deleted: { id: removed.id, title: removed.title }, backup };
    },
  },

  list_sprints: {
    description: "List sprints with their task counts and progress.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const { data } = store.read();
      return data.sprints.map((s) => {
        const tasks = data.tasks.filter((t) => t.sprintId === s.id);
        const done = tasks.filter((t) => t.status === "DONE");
        return {
          id: s.id,
          name: s.name,
          status: s.status,
          start: s.start,
          end: s.end,
          tasks: tasks.length,
          done: done.length,
          points: tasks.reduce((a, t) => a + points(t), 0),
          donePoints: done.reduce((a, t) => a + points(t), 0),
        };
      });
    },
  },

  create_sprint: {
    description: "Create a sprint. Making it active demotes any other active sprint.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        goal: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        status: { type: "string", enum: ["planned", "active", "closed"] },
      },
      required: ["name"],
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        if (!args.name?.trim()) throw new Error("name is required");
        const now = new Date().toISOString();
        const status = args.status || "planned";
        // Only ever one active sprint - everything downstream assumes it
        if (status === "active") {
          data.sprints = data.sprints.map((s) =>
            s.status === "active" ? { ...s, status: "planned" } : s
          );
        }
        data.sprints.push({
          id: newId(),
          // Same rule as create_task: sprints belong to the active project
          projectId: activeProject(data)?.id || null,
          name: args.name.trim(),
          goal: args.goal || "",
          start: args.start || "",
          end: args.end || "",
          status,
          origin: "mcp",
          created: now,
          updated: now,
        });
        return data;
      });
      return { created: snapshot.data.sprints.at(-1) };
    },
  },

  delete_sprint: {
    description:
      "Delete a sprint. Its tasks are moved to the backlog rather than left pointing at a sprint that no longer exists.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("delete");
      let moved = 0;
      const { backup } = store.mutate((data) => {
        const sprint = findSprint(data, args.id);
        if (!sprint) throw new Error(`no sprint matching "${args.id}"`);
        data.sprints = data.sprints.filter((s) => s.id !== sprint.id);
        // Without this the tasks vanish from every view
        data.tasks = data.tasks.map((t) => {
          if (t.sprintId !== sprint.id) return t;
          moved++;
          return { ...t, sprintId: null, status: "BACKLOG" };
        });
        return data;
      });
      return { deleted: args.id, tasksMovedToBacklog: moved, backup };
    },
  },

  list_projects: {
    description:
      "List projects with their sprint and task counts. Projects are the top of the hierarchy - sprints and tasks belong to one.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const { data } = store.read();
      return (data.projects || []).map((p) => {
        const tasks = data.tasks.filter((t) => t.projectId === p.id);
        const done = tasks.filter((t) => t.status === "DONE");
        return {
          id: p.id.slice(0, 8),
          name: p.name,
          slogan: p.slogan || null,
          status: p.status,
          sprints: (data.sprints || []).filter((s) => s.projectId === p.id).length,
          tasks: tasks.length,
          done: done.length,
          points: tasks.reduce((a, t) => a + points(t), 0),
        };
      });
    },
  },

  create_project: {
    description: "Create a project. Sprints and tasks can then be assigned to it.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        slogan: { type: "string", description: "Short tagline shown under the name" },
        description: { type: "string" },
        color: { type: "string", description: "Hex colour, e.g. #2dd4bf" },
      },
      required: ["name"],
    },
    run(args) {
      requireAccess("write");
      let created = null;

      store.mutate((data) => {
        if (!data.projects) data.projects = [];
        const now = new Date().toISOString();
        created = {
          id: newId(),
          name: args.name,
          slogan: args.slogan || "",
          description: args.description || "",
          color: args.color || "#2dd4bf",
          image: null,
          status: "active",
          origin: "mcp",
          created: now,
          updated: now,
        };
        data.projects.push(created);
        return data;
      });

      return { created: created.name, id: created.id };
    },
  },

  update_project: {
    description: "Change a project's name, slogan, description, colour or status.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project id, short prefix or name" },
        name: { type: "string" },
        slogan: { type: "string" },
        description: { type: "string" },
        color: { type: "string" },
        status: { type: "string", enum: ["active", "archived"] },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      let result = null;

      store.mutate((data) => {
        const project = findProject(data, args.id);
        if (!project) throw new Error(`no project matching "${args.id}"`);

        for (const field of ["name", "slogan", "description", "color", "status"]) {
          if (args[field] !== undefined) project[field] = args[field];
        }
        project.updated = new Date().toISOString();
        result = { updated: project.name };
        return data;
      });

      return result;
    },
  },

  delete_project: {
    description:
      "Delete a project. Its sprints and tasks are kept but unassigned, never deleted - say so in your summary.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Project id, short prefix or name" } },
      required: ["id"],
    },
    run(args) {
      requireAccess("delete");
      let result = null;

      store.mutate((data) => {
        const project = findProject(data, args.id);
        if (!project) throw new Error(`no project matching "${args.id}"`);

        let sprints = 0;
        for (const sprint of data.sprints || []) {
          if (sprint.projectId === project.id) {
            sprint.projectId = null;
            sprints += 1;
          }
        }

        let tasks = 0;
        for (const task of data.tasks || []) {
          if (task.projectId === project.id) {
            task.projectId = null;
            tasks += 1;
          }
        }

        data.projects = (data.projects || []).filter((p) => p.id !== project.id);
        result = { deleted: project.name, sprintsUnassigned: sprints, tasksUnassigned: tasks };
        return data;
      });

      return result;
    },
  },

  board_summary: {
    description: "Counts and points per board column for the active sprint, or the whole board.",
    schema: {
      type: "object",
      properties: { sprint: { type: "string", description: "Sprint name or id; omit for everything" } },
    },
    run(args) {
      requireAccess("read");
      const { data } = store.read();
      let rows = data.tasks;
      let label = "all tasks";
      if (args.sprint) {
        const s = findSprint(data, args.sprint);
        if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
        rows = rows.filter((t) => t.sprintId === s.id);
        label = s.name;
      }
      const byStatus = {};
      for (const t of rows) {
        byStatus[t.status] ??= { tasks: 0, points: 0 };
        byStatus[t.status].tasks++;
        byStatus[t.status].points += points(t);
      }
      return {
        scope: label,
        total: rows.length,
        totalPoints: rows.reduce((a, t) => a + points(t), 0),
        byStatus,
      };
    },
  },

  list_users: {
    description: "Team members with their task counts.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const { data } = store.read();
      return data.users.map((u) => ({
        id: u.id,
        name: `${u.name || ""} ${u.lastname || ""}`.trim(),
        rol: u.rol,
        tasks: data.tasks.filter((t) => t.assigneeId === u.id).length,
      }));
    },
  },

  health_check: {
    description:
      "Report data integrity: dangling references, records missing a uuid, duplicate ids.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const snap = store.read();
      const d = snap.data;
      const noUuid = [];
      for (const key of ["tasks", "sprints", "users", "tags"]) {
        for (const row of d[key]) if (!isUuid(row.id)) noUuid.push({ key, id: row.id });
      }
      return {
        file: store.file,
        revision: snapshot_revision(snap),
        counts: {
          tasks: d.tasks.length,
          sprints: d.sprints.length,
          users: d.users.length,
          tags: d.tags.length,
        },
        recordsWithoutUuid: noUuid,
        danglingReferences: findDanglingReferences(d),
      };
    },
  },

  // --- workspace context ---------------------------------------------------

  describe_workspace: {
    description:
      "READ THIS FIRST. Explains how this FlowStack board works and returns its current configuration: methodology, board columns, sprints, team, tags and settings. Call it before making changes so edits match how the board is actually set up.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const { data } = store.read();
      const s = data.settings || {};
      const active = data.sprints.find((x) => x.status === "active");

      return {
        howItWorks: {
          sprints:
            "A sprint is planned, active or closed. Exactly ONE sprint may be active at a time - activating another demotes the current one to planned. Completing a sprint closes it and moves its unfinished tasks to the backlog, so nothing is lost.",
          backlog:
            "The backlog is simply every task with no sprintId. Moving a task to the backlog means clearing its sprint, not changing its status.",
          statuses:
            "Statuses are the board columns. They are matched by NAME, not by id, because they are configuration shared across installs. BACKLOG and DONE are system columns and cannot be deleted. A task whose status matches no column falls back to BACKLOG.",
          relationships:
            "Tasks link to a sprint, a user and tags by UUID (sprintId, assigneeId, tagIds). The readable mirrors (asign, tags) are kept in sync automatically - set either side and both end up correct. A write that would leave a reference pointing at a record that does not exist is refused.",
          points:
            "Story points are stored as strings but always compared as numbers. Velocity and totals count only tasks in the DONE column.",
          methodology:
            "The methodology setting controls which views the app shows. 'agile' shows sprints and backlog, 'kanban' shows the board and backlog without sprints, 'waterfall' shows tasks only.",
        },
        configuration: {
          methodology: s.methodology || "agile",
          autoFinishSprints: Boolean(s.autoFinishSprints),
          showScrollButtons: s.showScrollButtons !== false,
          mcp: s.mcp || { enabled: true, allowWrite: false, allowDelete: false },
        },
        board: {
          columns: (data.statuses || []).map((x) => ({
            status: x.status,
            visible: x.show !== false,
            system: Boolean(x.isSystem),
          })),
        },
        sprints: data.sprints.map((x) => ({
          id: x.id,
          name: x.name,
          status: x.status,
          start: x.start,
          end: x.end,
          tasks: data.tasks.filter((t) => t.sprintId === x.id).length,
        })),
        activeSprint: active ? { id: active.id, name: active.name, goal: active.goal } : null,
        team: data.users.map((u) => ({
          id: u.id,
          name: `${u.name || ""} ${u.lastname || ""}`.trim(),
          rol: u.rol,
        })),
        tags: data.tags.map((t) => t.name),
        // Which project new work joins, and what else exists. Without this the
        // model has no idea the board is partitioned at all.
        activeProject: (() => {
          const p = activeProject(data);
          return p ? { id: p.id.slice(0, 8), name: p.name, slogan: p.slogan || null } : null;
        })(),
        projects: (data.projects || []).map((p) => ({
          id: p.id.slice(0, 8),
          name: p.name,
          tasks: data.tasks.filter((t) => t.projectId === p.id).length,
        })),
        totals: {
          tasks: data.tasks.filter((t) => !t.archived).length,
          archived: data.tasks.filter((t) => t.archived).length,
          backlog: data.tasks.filter((t) => !t.sprintId && !t.archived).length,
          unassignedToProject: data.tasks.filter((t) => !t.projectId).length,
        },
      };
    },
  },

  // --- sprints -------------------------------------------------------------

  update_sprint: {
    description: "Update a sprint's name, goal or dates. Use activate_sprint / complete_sprint to change its state.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Sprint name or id" },
        name: { type: "string" },
        goal: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        const sprint = findSprint(data, args.id);
        if (!sprint) throw new Error(`no sprint matching "${args.id}"`);
        for (const f of ["name", "goal", "start", "end"]) {
          if (args[f] !== undefined) sprint[f] = args[f];
        }
        sprint.updated = new Date().toISOString();
        return data;
      });
      return { updated: snapshot.data.sprints.find((s) => s.name === (args.name || args.id)) || args.id };
    },
  },

  activate_sprint: {
    description:
      "Make a sprint active. Any other active sprint is demoted to planned, because only one can be active.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("write");
      let demoted = null;
      store.mutate((data) => {
        const sprint = findSprint(data, args.id);
        if (!sprint) throw new Error(`no sprint matching "${args.id}"`);
        data.sprints = data.sprints.map((s) => {
          if (s.id === sprint.id) return { ...s, status: "active", updated: new Date().toISOString() };
          if (s.status === "active") {
            demoted = s.name;
            return { ...s, status: "planned" };
          }
          return s;
        });
        return data;
      });
      return { activated: args.id, demoted };
    },
  },

  complete_sprint: {
    description:
      "Close a sprint. Unfinished tasks are moved to the backlog rather than being left in a closed sprint.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("write");
      let moved = 0;
      store.mutate((data) => {
        const sprint = findSprint(data, args.id);
        if (!sprint) throw new Error(`no sprint matching "${args.id}"`);
        data.tasks = data.tasks.map((t) => {
          if (t.sprintId !== sprint.id || t.status === "DONE") return t;
          moved++;
          return { ...t, sprintId: null, status: "BACKLOG" };
        });
        data.sprints = data.sprints.map((s) =>
          s.id === sprint.id ? { ...s, status: "closed", updated: new Date().toISOString() } : s
        );
        return data;
      });
      return { completed: args.id, unfinishedMovedToBacklog: moved };
    },
  },

  move_task: {
    description: "Move a task to a different sprint and/or board column in one step.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        sprint: { type: "string", description: "Sprint name or id, or 'backlog'" },
        status: { type: "string" },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      store.mutate((data) => {
        const task = findTask(data, args.id);
        if (!task) throw new Error(`no task with id ${args.id}`);

        if (args.sprint !== undefined) {
          if (args.sprint === "backlog") task.sprintId = null;
          else {
            const s = findSprint(data, args.sprint);
            if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
            task.sprintId = s.id;
            // Follow the sprint's project, as the app does
            if (s.projectId) task.projectId = s.projectId;
          }
        }
        if (args.status !== undefined) {
          const known = (data.statuses || []).some((s) => s.status === args.status);
          if (!known) throw new Error(`"${args.status}" is not a board column`);
          task.status = args.status;
        }
        task.updated = new Date().toISOString();
        return data;
      });
      return { moved: args.id, sprint: args.sprint, status: args.status };
    },
  },

  // --- team ----------------------------------------------------------------

  create_user: {
    description: "Add a team member. Their UUID is what tasks reference as assigneeId.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        lastname: { type: "string" },
        rol: { type: "string", description: "e.g. Developer, Designer, QA Engineer" },
        email: { type: "string" },
      },
      required: ["name"],
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        if (!args.name?.trim()) throw new Error("name is required");
        const now = new Date().toISOString();
        data.users.push({
          id: newId(),
          name: args.name.trim(),
          lastname: args.lastname || "",
          rol: args.rol || "Developer",
          email: args.email || "",
          origin: "mcp",
          created: now,
          updated: now,
        });
        return data;
      });
      return { created: snapshot.data.users.at(-1) };
    },
  },

  update_user: {
    description: "Update a team member. Renaming keeps every task assignment, because tasks link by UUID.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "User name or id" },
        name: { type: "string" },
        lastname: { type: "string" },
        rol: { type: "string" },
        email: { type: "string" },
        color: { type: "string", description: "Avatar colour as hex, e.g. #2dd4bf" },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      store.mutate((data) => {
        const user = findUser(data, args.id);
        if (!user) throw new Error(`no user matching "${args.id}"`);
        for (const f of ["name", "lastname", "rol", "email", "color"]) {
          if (args[f] !== undefined) user[f] = args[f];
        }
        user.updated = new Date().toISOString();

        // Keep the readable mirror on their tasks in step with the new name
        const full = `${user.name || ""} ${user.lastname || ""}`.trim();
        data.tasks = data.tasks.map((t) => (t.assigneeId === user.id ? { ...t, asign: full } : t));
        return data;
      });
      return { updated: args.id };
    },
  },

  archive_task: {
    description:
      "Archive a task, or restore one. Archiving hides it from the board WITHOUT changing its status or column, so restoring puts it back exactly where it was and reports still see its real state. Prefer this over deleting work that is simply finished with.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id or short prefix" },
        archived: {
          type: "boolean",
          description: "true to archive, false to restore. Defaults to true.",
        },
      },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      let result = null;

      store.mutate((data) => {
        const task = findTask(data, args.id);
        if (!task) throw new Error(`no task with id ${args.id}`);

        const archived = args.archived === undefined ? true : Boolean(args.archived);
        const now = new Date().toISOString();
        task.archived = archived;
        task.archivedAt = archived ? now : null;
        task.updated = now;

        result = {
          [archived ? "archived" : "restored"]: task.title,
          status: task.status,
          note: "status unchanged",
        };
        return data;
      });

      return result;
    },
  },

  delete_user: {
    description:
      "Remove a team member. Their tasks are unassigned rather than left pointing at a user that no longer exists.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      requireAccess("delete");
      let unassigned = 0;
      const { backup } = store.mutate((data) => {
        const user = findUser(data, args.id);
        if (!user) throw new Error(`no user matching "${args.id}"`);
        data.users = data.users.filter((u) => u.id !== user.id);
        data.tasks = data.tasks.map((t) => {
          if (t.assigneeId !== user.id) return t;
          unassigned++;
          return { ...t, assigneeId: null, asign: "" };
        });
        return data;
      });
      return { deleted: args.id, tasksUnassigned: unassigned, backup };
    },
  },

  // --- board columns -------------------------------------------------------

  create_status: {
    description: "Add a board column. Its id is its name, since statuses are matched by name across installs.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Column name, e.g. QA" },
        color: { type: "string", description: "Hex colour" },
      },
      required: ["status"],
    },
    run(args) {
      requireAccess("write");
      store.mutate((data) => {
        const name = args.status?.trim();
        if (!name) throw new Error("status is required");
        if (data.statuses.some((s) => s.status === name)) throw new Error(`"${name}" already exists`);
        const maxOrder = data.statuses.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
        data.statuses.push({
          id: name,
          status: name,
          color: args.color || "#64748b",
          show: true,
          order: maxOrder + 1,
          created: new Date().toISOString(),
        });
        return data;
      });
      return { created: args.status };
    },
  },

  delete_status: {
    description:
      "Remove a board column. Its tasks move to BACKLOG. System columns (BACKLOG, DONE) cannot be removed.",
    schema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
    run(args) {
      requireAccess("delete");
      let moved = 0;
      const { backup } = store.mutate((data) => {
        const col = data.statuses.find((s) => s.status === args.status);
        if (!col) throw new Error(`no column named "${args.status}"`);
        if (col.isSystem || ["BACKLOG", "DONE"].includes(col.status)) {
          throw new Error(`"${col.status}" is a system column and cannot be deleted`);
        }
        data.statuses = data.statuses.filter((s) => s.status !== args.status);
        data.tasks = data.tasks.map((t) => {
          if (t.status !== args.status) return t;
          moved++;
          return { ...t, status: "BACKLOG" };
        });
        return data;
      });
      return { deleted: args.status, tasksMovedToBacklog: moved, backup };
    },
  },

  // --- tags ----------------------------------------------------------------

  list_tags: {
    description: "Tags with how many tasks use each one.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      const { data } = store.read();
      return data.tags.map((t) => ({
        id: t.id,
        name: t.name,
        tasks: data.tasks.filter((x) => (x.tagIds || []).includes(t.id)).length,
      }));
    },
  },

  delete_tag: {
    description: "Delete a tag and remove it from every task that uses it.",
    schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    run(args) {
      requireAccess("delete");
      let affected = 0;
      const { backup } = store.mutate((data) => {
        const tag = data.tags.find((t) => (t.name || "").toLowerCase() === args.name.toLowerCase());
        if (!tag) throw new Error(`no tag named "${args.name}"`);
        data.tags = data.tags.filter((t) => t.id !== tag.id);
        data.tasks = data.tasks.map((t) => {
          if (!(t.tagIds || []).includes(tag.id)) return t;
          affected++;
          return {
            ...t,
            tagIds: t.tagIds.filter((id) => id !== tag.id),
            tags: (t.tags || []).filter((n) => n.toLowerCase() !== args.name.toLowerCase()),
          };
        });
        return data;
      });
      return { deleted: args.name, tasksAffected: affected, backup };
    },
  },

  // --- settings ------------------------------------------------------------

  get_settings: {
    description: "Current app settings, including MCP permissions.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      return store.read().data.settings || {};
    },
  },

  update_settings: {
    description:
      "Change app settings. Methodology decides which views the app shows. MCP permissions are deliberately NOT changeable here - only the user can widen those, from the app.",
    schema: {
      type: "object",
      properties: {
        methodology: { type: "string", enum: ["agile", "kanban", "waterfall"] },
        autoFinishSprints: { type: "boolean" },
        showScrollButtons: { type: "boolean" },
        theme: { type: "string", enum: ["light", "dark"] },
      },
    },
    run(args) {
      requireAccess("write");
      const { snapshot } = store.mutate((data) => {
        data.settings ??= {};
        for (const f of ["methodology", "autoFinishSprints", "showScrollButtons", "theme"]) {
          if (args[f] !== undefined) data.settings[f] = args[f];
        }
        // Never let the server widen its own permissions
        return data;
      });
      return { settings: snapshot.data.settings };
    },
  },

  // --- subtasks ------------------------------------------------------------

  set_subtasks: {
    description:
      "Tick, untick, add, rename or remove a task's subtasks. Match an existing subtask by its id, its 8-char id prefix, or its exact text; anything unmatched with a `text` is added. Only the subtasks you name are touched — the rest keep their state.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id or short prefix" },
        subtasks: {
          type: "array",
          description: "Subtasks to change",
          items: {
            type: "object",
            properties: {
              match: { type: "string", description: "Existing subtask id, id prefix, or exact text" },
              text: { type: "string", description: "New text (renames when matched, adds when not)" },
              completed: { type: "boolean" },
              remove: { type: "boolean" },
            },
          },
        },
      },
      required: ["id", "subtasks"],
    },
    run(args) {
      requireAccess("write");
      let report = null;

      store.mutate((data) => {
        const task = findTask(data, args.id);
        if (!task) throw new Error(`no task with id ${args.id}`);

        const list = Array.isArray(task.subtasks) ? [...task.subtasks] : [];
        const changes = { ticked: 0, unticked: 0, added: 0, renamed: 0, removed: 0 };

        for (const change of args.subtasks || []) {
          const ref = change.match ?? change.text;
          const idx = ref
            ? list.findIndex(
                (st) =>
                  st.id === ref ||
                  st.id.startsWith(ref) ||
                  (st.text || "").toLowerCase() === String(ref).toLowerCase()
              )
            : -1;

          if (idx === -1) {
            // Nothing matched - only a `text` justifies creating a new one, so a
            // typo'd match cannot silently become a duplicate subtask
            if (!change.text) throw new Error(`no subtask matching "${ref}" on this task`);
            list.push({ id: newId(), text: change.text.trim(), completed: Boolean(change.completed) });
            changes.added++;
            continue;
          }

          if (change.remove) {
            list.splice(idx, 1);
            changes.removed++;
            continue;
          }
          if (change.text && change.text !== list[idx].text) {
            list[idx] = { ...list[idx], text: change.text.trim() };
            changes.renamed++;
          }
          if (typeof change.completed === "boolean" && change.completed !== list[idx].completed) {
            list[idx] = { ...list[idx], completed: change.completed };
            changes[change.completed ? "ticked" : "unticked"]++;
          }
        }

        task.subtasks = normalizeSubtasks(list);
        task.updated = new Date().toISOString();

        const done = task.subtasks.filter((st) => st.completed).length;
        report = {
          task: task.title,
          changes,
          progress: `${done}/${task.subtasks.length}`,
          allComplete: task.subtasks.length > 0 && done === task.subtasks.length,
          subtasks: task.subtasks.map((st) => `${st.completed ? "[x]" : "[ ]"} ${st.text}`),
        };
        return data;
      });

      return report;
    },
  },

  // --- batch ---------------------------------------------------------------

  bulk_update_tasks: {
    description:
      "Apply the same change to several tasks in one write. Far cheaper than one call per task, and the whole batch is validated together — if any task would break a relationship, none of them change.",
    schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Task ids or short prefixes" },
        status: { type: "string" },
        sprint: { type: "string", description: "Sprint name or id, or 'backlog'" },
        assignee: { type: "string" },
        priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
        blocked: { type: "boolean" },
        blocker: { type: "string" },
      },
      required: ["ids"],
    },
    run(args) {
      requireAccess("write");
      const changed = [];

      store.mutate((data) => {
        const updates = {};
        for (const f of ["status", "priority", "blocker"]) {
          if (args[f] !== undefined) updates[f] = args[f];
        }
        if (args.blocked !== undefined) updates.blocked = Boolean(args.blocked);

        if (args.sprint !== undefined) {
          if (args.sprint === "backlog") updates.sprintId = null;
          else {
            const s = findSprint(data, args.sprint);
            if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
            updates.sprintId = s.id;
          }
        }
        if (args.assignee !== undefined) {
          if (!args.assignee) updates.assigneeId = null;
          else {
            const u = findUser(data, args.assignee);
            if (!u) throw new Error(`no user matching "${args.assignee}"`);
            updates.assigneeId = u.id;
          }
        }
        if (args.status && !(data.statuses || []).some((s) => s.status === args.status)) {
          throw new Error(`"${args.status}" is not a board column`);
        }
        if (Object.keys(updates).length === 0) throw new Error("nothing to change");

        // Resolve every id first: a bad id fails the batch before anything is
        // written, rather than leaving half the tasks updated
        const targets = args.ids.map((ref) => {
          const t = findTask(data, ref);
          if (!t) throw new Error(`no task with id ${ref}`);
          return t;
        });

        const now = new Date().toISOString();
        for (const task of targets) {
          const history = [...(task.history || []), ...getChangedFields(task, updates)];
          Object.assign(task, resolveRelations({ ...task, ...updates, updated: now, history }, world(data)));
          changed.push(`${task.id.slice(0, 8)} ${task.title}`);
        }
        return data;
      });

      return { updated: changed.length, tasks: changed };
    },
  },

  // --- recovery ------------------------------------------------------------

  list_backups: {
    description: "List recent automatic backups, newest first. Every destructive change writes one.",
    schema: { type: "object", properties: {} },
    run() {
      requireAccess("read");
      return { dir: store.backupDir, backups: store.listBackups() };
    },
  },

  restore_backup: {
    description:
      "Roll the board back to a backup taken before a destructive change. Backs up the CURRENT state first, so a restore is itself undoable.",
    schema: {
      type: "object",
      properties: { name: { type: "string", description: "Backup filename from list_backups; omit for the most recent" } },
    },
    run(args) {
      requireAccess("delete");
      return store.restoreBackup(args.name);
    },
  },

  // --- grooming ------------------------------------------------------------

  find_issues: {
    description:
      "Report tasks that need attention before planning: unestimated, oversized, missing acceptance criteria, blocked, stale, or stranded in a closed sprint. Read-only.",
    schema: {
      type: "object",
      properties: {
        sprint: { type: "string", description: "Limit to one sprint, or 'backlog'" },
        staleDays: { type: "number", description: "Days without an update to count as stale (default 30)" },
      },
    },
    run(args) {
      requireAccess("read");
      const { data } = store.read();
      const closedSprintIds = new Set(
        data.sprints.filter((s) => s.status === "closed").map((s) => s.id)
      );

      let rows = data.tasks;
      if (args.sprint === "backlog") rows = rows.filter((t) => !t.sprintId);
      else if (args.sprint) {
        const s = findSprint(data, args.sprint);
        if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
        rows = rows.filter((t) => t.sprintId === s.id);
      }

      const staleDays = Number.isFinite(args.staleDays) ? args.staleDays : 30;
      const staleBefore = Date.now() - staleDays * 86400000;
      const label = (t) => `${t.id.slice(0, 8)} ${t.title}`;
      const open = rows.filter((t) => t.status !== "DONE");

      const issues = {
        unestimated: open.filter((t) => !points(t)).map(label),
        oversized: open.filter((t) => points(t) >= 13).map(label),
        noAcceptance: open.filter((t) => points(t) >= 5 && !(t.acceptance || "").trim()).map(label),
        blocked: open.filter((t) => t.blocked).map((t) => `${label(t)} — ${t.blocker || "no reason given"}`),
        unassigned: open.filter((t) => !t.assigneeId).map(label),
        stale: open
          .filter((t) => new Date(t.updated || t.created || 0).getTime() < staleBefore)
          .map(label),
        // Unfinished work in a closed sprint is invisible: it is not in the
        // backlog and no board renders a closed sprint
        strandedInClosedSprint: open
          .filter((t) => t.sprintId && closedSprintIds.has(t.sprintId))
          .map(label),
      };

      const counts = Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length]));
      return { scope: args.sprint || "all tasks", openTasks: open.length, counts, issues };
    },
  },

  // --- timers --------------------------------------------------------------

  start_timer: {
    description:
      "Start the work timer on a task. Only one timer runs at a time, so any other running timer is paused first and its elapsed time banked — same rule the app enforces.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Task id or short prefix" } },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      let result = null;

      store.mutate((data) => {
        const task = findTask(data, args.id);
        if (!task) throw new Error(`no task with id ${args.id}`);

        const paused = [];
        for (const other of data.tasks) {
          if (other.timerRunning && other.id !== task.id) {
            bankElapsed(other);
            paused.push(`${other.id.slice(0, 8)} ${other.title}`);
          }
        }

        if (!task.timerRunning) {
          task.timerRunning = true;
          task.timerStartedAt = new Date().toISOString();
          task.elapsedSeconds = task.elapsedSeconds || 0;
          task.updated = new Date().toISOString();
        }

        result = {
          started: task.title,
          pausedOthers: paused,
          elapsed: formatElapsed(liveElapsed(task)),
        };
        return data;
      });

      return result;
    },
  },

  stop_timer: {
    description:
      "Pause the timer on a task and bank the time worked. Omit the id to pause whichever timer is currently running.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Task id or short prefix; omit for the running one" } },
    },
    run(args) {
      requireAccess("write");
      let result = null;

      store.mutate((data) => {
        const task = args.id
          ? findTask(data, args.id)
          : data.tasks.find((t) => t.timerRunning);

        if (!task) {
          throw new Error(args.id ? `no task with id ${args.id}` : "no timer is running");
        }
        if (!task.timerRunning) {
          result = { alreadyStopped: task.title, elapsed: formatElapsed(task.elapsedSeconds || 0) };
          return data;
        }

        const added = bankElapsed(task);
        result = {
          stopped: task.title,
          thisSession: formatElapsed(added),
          totalElapsed: formatElapsed(task.elapsedSeconds || 0),
        };
        return data;
      });

      return result;
    },
  },

  reset_timer: {
    description: "Reset a task's timer to zero, discarding the time logged against it.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Task id or short prefix" } },
      required: ["id"],
    },
    run(args) {
      requireAccess("write");
      let result = null;

      store.mutate((data) => {
        const task = findTask(data, args.id);
        if (!task) throw new Error(`no task with id ${args.id}`);

        result = { reset: task.title, discarded: formatElapsed(liveElapsed(task)) };
        task.timerRunning = false;
        task.timerStartedAt = null;
        task.elapsedSeconds = 0;
        task.updated = new Date().toISOString();
        return data;
      });

      return result;
    },
  },

  timer_status: {
    description:
      "What is being worked on right now, and the time logged per task. Read-only — running timers report live elapsed time without writing.",
    schema: {
      type: "object",
      properties: {
        sprint: { type: "string", description: "Limit the logged-time list to one sprint, or 'backlog'" },
      },
    },
    run(args) {
      requireAccess("read");
      const { data } = store.read();

      let rows = data.tasks;
      if (args.sprint === "backlog") rows = rows.filter((t) => !t.sprintId);
      else if (args.sprint) {
        const s = findSprint(data, args.sprint);
        if (!s) throw new Error(`no sprint matching "${args.sprint}"`);
        rows = rows.filter((t) => t.sprintId === s.id);
      }

      const running = data.tasks.find((t) => t.timerRunning);
      const logged = rows
        .filter((t) => liveElapsed(t) > 0)
        .sort((a, b) => liveElapsed(b) - liveElapsed(a))
        .map((t) => `${t.id.slice(0, 8)} | ${formatElapsed(liveElapsed(t))} | ${t.title}${t.timerRunning ? " (running)" : ""}`);

      return {
        running: running
          ? {
              id: running.id.slice(0, 8),
              title: running.title,
              elapsed: formatElapsed(liveElapsed(running)),
              since: running.timerStartedAt,
            }
          : null,
        scope: args.sprint || "all tasks",
        totalLogged: formatElapsed(rows.reduce((sum, t) => sum + liveElapsed(t), 0)),
        tasksWithTime: logged,
      };
    },
  },
};

const snapshot_revision = (s) => s.revision || 0;

// --- JSON-RPC over stdio ---------------------------------------------------

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id, message, code = -32603) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not addressed to us in any meaningful way
  }

  const { id, method, params } = msg;

  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "flowstack", version: "1.0.0" },
        // Sent once at connection time, so the model has the domain model
        // before it reaches for a tool. describe_workspace returns the same
        // rules plus the board's live configuration.
        instructions: [
          "FlowStack is a local sprint and task board. Call describe_workspace first: it returns these rules together with the board's actual configuration (methodology, columns, sprints, team, tags).",
          "",
          "Projects: the top of the hierarchy. Sprints and tasks each belong to exactly one, via projectId. The app works in one project at a time and marks it isActive - tasks and sprints you create join it automatically, so you rarely set projectId yourself. A record with no project is INVISIBLE in the app's project-scoped views, so never clear it. See list_projects.",
          "",
          "Sprints: planned -> active -> closed. Exactly ONE sprint may be active; activating another demotes the current one. Completing a sprint moves its unfinished tasks to the backlog so nothing is stranded.",
          "",
          "Archived: a task can be archived, which hides it from the board WITHOUT changing its status or column. list_tasks excludes archived tasks by default, matching what the user sees; pass archived:'only' or 'include' to reach them. Archive rather than delete when work is simply finished with - see archive_task.",
          "",
          "Backlog: any task with no sprintId. To move something to the backlog, clear its sprint - do not just change its status.",
          "",
          "Columns: statuses are matched by NAME, not id, because they are configuration shared across installs. BACKLOG and DONE are system columns and cannot be deleted.",
          "",
          "Relationships are UUIDs (sprintId, assigneeId, tagIds); the readable mirrors (asign, tags) stay in sync automatically. You may pass a sprint or user by name and it will be resolved. Any write that would leave a reference pointing at a missing record is refused.",
          "",
          "Permissions live in the app's settings: reading may be allowed while writing and deleting are not. If a tool is refused, tell the user to enable it in Settings > MCP access rather than trying to work around it.",
          "",
          "Deletions are recoverable - each one backs up the previous state first - but still confirm with the user before deleting anything you were not explicitly asked to.",
        ].join("\n"),
      });
    }

    if (method === "notifications/initialized") return;

    if (method === "tools/list") {
      return reply(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.schema,
        })),
      });
    }

    if (method === "tools/call") {
      const tool = TOOLS[params?.name];
      if (!tool) return fail(id, `unknown tool: ${params?.name}`, -32601);

      const result = tool.run(params.arguments || {});
      return reply(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    }

    if (id !== undefined) fail(id, `unknown method: ${method}`, -32601);
  } catch (err) {
    if (id !== undefined) fail(id, err.message);
  }
});
