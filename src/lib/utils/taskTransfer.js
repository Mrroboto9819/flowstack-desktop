/**
 * Task transfer - export and import tasks as standalone JSON.
 *
 * Distinct from the whole-app backup in stores/index.js: that one replaces every
 * storage key and reloads the app. This one moves *tasks only* and merges them
 * into whatever is already there, so you can pull tasks in from another export
 * without losing your current board.
 */

import { toastStore } from "../toastStore.svelte.js";
import { taskStore, sprintStore, statusStore, userStore, tagStore } from "../stores/index.js";
import { isUuid } from "../stores/tasks.svelte.js";

/** Mint a UUID for any record that reaches export without one. */
function ensureUuid(value) {
  return isUuid(value) ? value : crypto.randomUUID();
}

const FORMAT_VERSION = "1.0";
const FILE_KIND = "tasks";

function timestampedFileName() {
  const today = new Date();
  const stamp = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return `flowstack-tasks-${stamp}.json`;
}

/**
 * Build the export payload for a set of tasks.
 *
 * Each task is annotated with its sprint *name* alongside the raw `sprintId`, so
 * an exported file stays readable and hand-editable - and so it re-imports
 * correctly into another install where the sprint UUIDs differ.
 *
 * @param {any[]} tasks
 * @param {{sprints?: any[], users?: any[], tags?: any[], statuses?: any[]}} [options]
 */
export function buildTaskExport(tasks, { sprints = [], users = [], tags = [], statuses = [] } = {}) {
  const sprintsById = {};
  for (const sprint of sprints) {
    sprintsById[sprint.id] = sprint;
  }

  // Carry the full sprint records the exported tasks point at. The importer
  // recreates any that are missing *under their original UUID*, so the
  // task -> sprint relationship survives by id across installs rather than
  // relying on names matching.
  const referencedSprints = [];
  const seenSprintIds = new Set();
  for (const task of tasks) {
    if (task.sprintId && sprintsById[task.sprintId] && !seenSprintIds.has(task.sprintId)) {
      seenSprintIds.add(task.sprintId);
      referencedSprints.push(sprintsById[task.sprintId]);
    }
  }

  return {
    formatVersion: FORMAT_VERSION,
    appName: "FlowStack",
    kind: FILE_KIND,
    exportedAt: new Date().toISOString(),
    count: tasks.length,
    // Every record the exported tasks point at travels with them, so a fresh
    // install can rebuild each relationship from its UUID rather than guessing
    // from names. Statuses keep their semantic ids by design - they are config
    // referenced by name, not entities.
    sprints: referencedSprints.map((sprint) => ({ ...sprint, id: ensureUuid(sprint.id) })),
    users: users.filter((u) => tasks.some((t) => t.assigneeId === u.id)),
    tags: tags.filter((tag) =>
      tasks.some((t) => Array.isArray(t.tagIds) && t.tagIds.includes(tag.id))
    ),
    statuses: statuses.filter((s) => tasks.some((t) => t.status === s.status)),
    // Nothing leaves the app without a UUID. Any record still carrying a legacy
    // or hand-authored id is given a real one here, so an export file is always
    // a valid set of keys to join on.
    tasks: tasks.map((task) => ({
      ...task,
      id: ensureUuid(task.id),
      subtasks: Array.isArray(task.subtasks)
        ? task.subtasks.map((st) => ({ ...st, id: ensureUuid(st.id) }))
        : task.subtasks,
      // Name is a human-readable mirror of sprintId, and the fallback for
      // hand-written files that have no UUID to work with
      sprint: task.sprintId ? sprintsById[task.sprintId]?.name || null : null,
    })),
  };
}

/**
 * Pull the task array out of a parsed file.
 *
 * Accepts three shapes so an import rarely fails on formatting alone:
 *   1. this module's own export  -> { kind: "tasks", tasks: [...] }
 *   2. a full app backup         -> { data: { tasks: [...] } }
 *   3. a bare array              -> [...]
 *
 * @param {any} parsed
 * @returns {any[] | null} the tasks, or null if none could be found
 */
export function extractTasks(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed.tasks)) return parsed.tasks;
  if (parsed.data && Array.isArray(parsed.data.tasks)) return parsed.data.tasks;
  return null;
}

/**
 * Write tasks to a JSON file via the native save dialog, falling back to a
 * browser download when the Tauri plugins are unavailable (e.g. `vite dev`).
 *
 * @param {any[]} tasks - Tasks to export
 * @returns {Promise<boolean>} true if a file was written
 */
export async function exportTasksToFile(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    toastStore.warning("There are no tasks to export");
    return false;
  }

  const json = JSON.stringify(
    buildTaskExport(tasks, {
      sprints: sprintStore.sprints,
      users: userStore.users,
      tags: tagStore.tags,
      statuses: statusStore.statuses,
    }),
    null,
    2
  );
  const fileName = timestampedFileName();

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: fileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Export Tasks",
    });

    // Null path means the user cancelled - not an error
    if (!filePath) return false;

    await writeTextFile(filePath, json);
    toastStore.success(`${tasks.length} task(s) exported`);
    return true;
  } catch (error) {
    console.warn("Native save dialog unavailable, using browser download:", error);

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toastStore.success(`${tasks.length} task(s) exported`);
    return true;
  }
}

/**
 * Merge a JSON payload of tasks into the store and report what happened.
 * @param {string} jsonText
 */
function mergeTasksFromText(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    toastStore.error("That file is not valid JSON");
    return false;
  }

  const incoming = extractTasks(parsed);
  if (!incoming) {
    toastStore.error("No tasks found in that file");
    return false;
  }

  // Recreate every referenced record this install is missing, each under its
  // ORIGINAL UUID, before the tasks land. Order matters: tasks resolve their
  // foreign keys against these, so they have to exist first.
  if (Array.isArray(parsed?.sprints)) {
    for (const sprint of parsed.sprints) {
      if (sprint?.id && sprint.name) sprintStore.restore(sprint);
    }
  }
  if (Array.isArray(parsed?.users)) {
    for (const user of parsed.users) {
      if (user?.id && user.name) userStore.restore(user);
    }
  }
  if (Array.isArray(parsed?.tags)) {
    for (const tag of parsed.tags) {
      if (tag?.id && tag.name) tagStore.restore(tag);
    }
  }
  // Custom board columns, so imported tasks land in the column they were in
  // rather than falling back to BACKLOG
  if (Array.isArray(parsed?.statuses)) {
    for (const status of parsed.statuses) {
      if (status?.status) statusStore.restore(status);
    }
  }

  // Lets an import file say `"sprint": "Sprint 12"` instead of a UUID
  const sprintIdsByName = {};
  for (const sprint of sprintStore.sprints) {
    if (typeof sprint.name === "string" && sprint.name.trim()) {
      sprintIdsByName[sprint.name.trim().toLowerCase()] = sprint.id;
    }
  }

  const result = taskStore.importTasks(incoming, {
    validStatuses: statusStore.statuses.map((s) => s.status),
    validSprintIds: sprintStore.sprints.map((s) => s.id),
    sprintIdsByName,
  });

  if (result.added === 0) {
    toastStore.info(
      result.skipped > 0
        ? `No new tasks - ${result.skipped} already existed or were invalid`
        : "No tasks were imported",
    );
    return false;
  }

  toastStore.success(`${result.added} task(s) imported`);

  // Surface the quieter outcomes separately so they aren't mistaken for failure
  if (result.skipped > 0) {
    toastStore.info(`${result.skipped} skipped (duplicate or invalid)`);
  }
  if (result.remapped > 0) {
    toastStore.info(`${result.remapped} field(s) reset to keep tasks reachable`);
  }

  return true;
}

/**
 * Read tasks from a File object (browser file-input fallback).
 * @param {File} file
 */
export async function importTasksFromFile(file) {
  try {
    return mergeTasksFromText(await file.text());
  } catch (error) {
    console.error("Task import failed:", error);
    toastStore.error("Could not read that file");
    return false;
  }
}

/**
 * Read tasks via the native open dialog, falling back to a hidden file input
 * when the Tauri plugins are unavailable.
 *
 * @returns {Promise<boolean>} true if any task was imported
 */
export async function importTasksWithDialog() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Import Tasks",
    });

    // Null path means the user cancelled - not an error
    if (!filePath || typeof filePath !== "string") return false;

    return mergeTasksFromText(await readTextFile(filePath));
  } catch (error) {
    console.warn("Native open dialog unavailable, using file input:", error);
    return importTasksWithFileInput();
  }
}

/**
 * Browser fallback: prompt for a file with a transient <input type="file">.
 * @returns {Promise<boolean>}
 */
function importTasksWithFileInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";

    input.onchange = async () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(file ? await importTasksFromFile(file) : false);
    };

    document.body.appendChild(input);
    input.click();
  });
}
