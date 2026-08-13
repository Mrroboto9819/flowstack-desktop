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
      "List tasks, optionally filtered. Returns a compact summary; use get_task for the full record.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Board column, e.g. READY" },
        sprint: { type: "string", description: "Sprint name or id, or 'backlog' for unassigned" },
        assignee: { type: "string", description: "User name or id" },
        tag: { type: "string" },
        blocked: { type: "boolean" },
        search: { type: "string", description: "Case-insensitive match on title" },
      },
    },
    run(args) {
      const { data } = store.read();
      let rows = data.tasks;
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
        rows = rows.filter((t) => (t.title || "").toLowerCase().includes(needle));
      }
      return { count: rows.length, tasks: rows.map((t) => summarise(t, data)) };
    },
  },

  get_task: {
    description: "Full record for one task, including description, acceptance criteria and subtasks.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run(args) {
      const { data } = store.read();
      const task = data.tasks.find((t) => t.id === args.id);
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
      const { snapshot } = store.mutate((data) => {
        const check = validateTask(args);
        if (!check.ok) throw new Error(check.error);

        const now = new Date().toISOString();
        const sprint = findSprint(data, args.sprint);
        const user = findUser(data, args.assignee);
        if (args.sprint && !sprint) throw new Error(`no sprint matching "${args.sprint}"`);
        if (args.assignee && !user) throw new Error(`no user matching "${args.assignee}"`);

        const task = {
          id: newId(),
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
      },
      required: ["id"],
    },
    run(args) {
      const { snapshot } = store.mutate((data) => {
        const idx = data.tasks.findIndex((t) => t.id === args.id);
        if (idx === -1) throw new Error(`no task with id ${args.id}`);
        const old = data.tasks[idx];

        const updates = {};
        for (const f of ["title", "description", "status", "priority", "blocker", "acceptance", "epic"]) {
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
      let removed = null;
      const { backup } = store.mutate((data) => {
        const idx = data.tasks.findIndex((t) => t.id === args.id);
        if (idx === -1) throw new Error(`no task with id ${args.id}`);
        removed = data.tasks[idx];
        data.tasks.splice(idx, 1);
        return data;
      });
      return { deleted: { id: removed.id, title: removed.title }, backup };
    },
  },

  list_sprints: {
    description: "List sprints with their task counts and progress.",
    schema: { type: "object", properties: {} },
    run() {
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

  board_summary: {
    description: "Counts and points per board column for the active sprint, or the whole board.",
    schema: {
      type: "object",
      properties: { sprint: { type: "string", description: "Sprint name or id; omit for everything" } },
    },
    run(args) {
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
