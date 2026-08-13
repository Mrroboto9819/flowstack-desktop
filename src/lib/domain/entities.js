/**
 * Domain rules - plain JavaScript, no Svelte runes, no browser APIs.
 *
 * This is the single implementation of "what a valid FlowStack record is":
 * id shape, relationship resolution, subtask normalisation, dedup.
 *
 * It lives outside the `.svelte.js` stores on purpose. Those use `$state`, so
 * Node cannot import them - and the MCP server runs in Node. If the server
 * reimplemented these rules they would drift, and drift here means dangling
 * foreign keys and orphaned tasks.
 *
 * Rule: anything that decides validity or relationships belongs here.
 * Anything that decides *reactivity* stays in the stores.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {any} value */
export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Generate a UUID. `crypto.randomUUID` exists in browsers and in Node 19+,
 * so no polyfill is needed on either side.
 */
export function newId() {
  return crypto.randomUUID();
}

/** Drop records sharing an id, keeping the first. @param {any[]} items */
export function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Fields whose changes are recorded on a task's history. */
export const TRACKED_FIELDS = [
  "sprintId",
  "status",
  "priority",
  "assigneeId",
  "asign",
  "points",
  "blocked",
];

/**
 * @param {string} field
 * @param {any} fromValue
 * @param {any} toValue
 * @param {string} [action]
 */
export function createHistoryEntry(field, fromValue, toValue, action = "update") {
  return {
    timestamp: new Date().toISOString(),
    field,
    from: fromValue ?? null,
    to: toValue ?? null,
    action,
  };
}

/**
 * History entries for whatever actually changed.
 * @param {any} oldTask
 * @param {any} updates
 */
export function getChangedFields(oldTask, updates) {
  const entries = [];
  for (const field of TRACKED_FIELDS) {
    if (field in updates && updates[field] !== oldTask[field]) {
      entries.push(createHistoryEntry(field, oldTask[field], updates[field]));
    }
  }
  return entries;
}

/**
 * Normalise a subtask list.
 *
 * The UI renders `subtask.text`; hand-written and third-party files often use
 * `title` or `label`, which renders as a blank row. Non-UUID ids ("st-1") are
 * reminted - safe because a subtask id is only ever referenced inside its
 * parent task.
 *
 * @param {any} subtasks
 */
export function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return [];

  return subtasks
    .map((st) => {
      if (typeof st === "string") {
        return { id: newId(), text: st, completed: false };
      }
      if (!st || typeof st !== "object") return null;

      const text = st.text ?? st.title ?? st.label ?? "";
      if (typeof text !== "string" || !text.trim()) return null;

      return {
        id: isUuid(st.id) ? st.id : newId(),
        text: text.trim(),
        completed: Boolean(st.completed),
      };
    })
    .filter(Boolean);
}

/**
 * Resolve a task's relationships to UUID foreign keys.
 *
 * `assigneeId` and `tagIds` are canonical; `asign` and `tags` are denormalised
 * display mirrors kept in sync so existing views keep working and exports stay
 * readable. Whichever side the caller supplied, both come out consistent.
 *
 * Pure: all lookups are passed in, so this works identically in the browser
 * store and in the MCP server.
 *
 * @param {any} task
 * @param {{users?: any[], tags?: any[], sprints?: any[], statuses?: any[]}} world
 */
export function resolveRelations(task, world = {}) {
  const users = world.users || [];
  const tags = world.tags || [];
  const sprints = world.sprints || [];
  const statuses = world.statuses || [];

  const patch = {};

  // --- assignee -----------------------------------------------------------
  const fullName = (u) => `${u.name || ""} ${u.lastname || ""}`.trim();
  if (isUuid(task.assigneeId)) {
    const user = users.find((u) => u.id === task.assigneeId);
    if (user) patch.asign = fullName(user);
    else patch.assigneeId = null; // points at a user that no longer exists
  } else if (typeof task.asign === "string" && task.asign.trim()) {
    const wanted = task.asign.trim().toLowerCase();
    const user = users.find((u) => fullName(u).toLowerCase() === wanted);
    patch.assigneeId = user ? user.id : null;
  } else {
    patch.assigneeId = null;
  }

  // --- tags ---------------------------------------------------------------
  if (Array.isArray(task.tagIds) && task.tagIds.length > 0) {
    patch.tags = task.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean);
  } else if (Array.isArray(task.tags) && task.tags.length > 0) {
    const matched = task.tags
      .map((name) => tags.find((t) => (t.name || "").toLowerCase() === String(name).trim().toLowerCase()))
      .filter(Boolean);
    patch.tagIds = matched.map((t) => t.id);
    patch.tags = matched.map((t) => t.name);
  } else {
    patch.tagIds = [];
  }

  // --- sprint -------------------------------------------------------------
  // An id that resolves to nothing is worse than none: the task would belong to
  // no sprint AND be filtered out of the backlog, making it invisible everywhere
  if (task.sprintId && !sprints.some((s) => s.id === task.sprintId)) {
    patch.sprintId = null;
  }

  // --- status -------------------------------------------------------------
  // Statuses are matched by name, not id - they are config, not entities
  if (statuses.length > 0 && !statuses.some((s) => s.status === task.status)) {
    patch.status = "BACKLOG";
  }

  return { ...task, ...patch };
}

/**
 * Story points as a number. The task form stores them as strings, so plain
 * `+` concatenates - which is what broke the Reports totals.
 * @param {any} task
 */
export function points(task) {
  const n = parseInt(task?.points, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Validate a task before it enters the store.
 * @param {any} task
 * @returns {{ok: boolean, error?: string}}
 */
export function validateTask(task) {
  if (!task || typeof task !== "object") return { ok: false, error: "task must be an object" };
  if (typeof task.title !== "string" || !task.title.trim()) {
    return { ok: false, error: "title is required" };
  }
  return { ok: true };
}

/**
 * Report every relationship that points at a record which does not exist.
 * Used by the MCP server to refuse a write that would corrupt the graph.
 *
 * @param {{tasks?: any[], sprints?: any[], users?: any[], tags?: any[]}} data
 * @returns {{field: string, taskId: string, value: string}[]}
 */
export function findDanglingReferences(data) {
  const sprintIds = new Set((data.sprints || []).map((s) => s.id));
  const userIds = new Set((data.users || []).map((u) => u.id));
  const tagIds = new Set((data.tags || []).map((t) => t.id));

  const problems = [];
  for (const task of data.tasks || []) {
    if (task.sprintId && !sprintIds.has(task.sprintId)) {
      problems.push({ field: "sprintId", taskId: task.id, value: task.sprintId });
    }
    if (task.assigneeId && !userIds.has(task.assigneeId)) {
      problems.push({ field: "assigneeId", taskId: task.id, value: task.assigneeId });
    }
    for (const id of task.tagIds || []) {
      if (!tagIds.has(id)) {
        problems.push({ field: "tagIds", taskId: task.id, value: id });
      }
    }
  }
  return problems;
}
