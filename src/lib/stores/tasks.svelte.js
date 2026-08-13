/**
 * Task store - Manages task state and CRUD operations
 */

import { toastStore } from "../toastStore.svelte.js";
import { tagStore } from "./tags.svelte.js";
import { userStore } from "./users.svelte.js";

const STORAGE_KEY = "taskflow_tasks";

let tasks = $state([]);
let hasHydrated = $state(false);

function newId() {
  return crypto.randomUUID();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a canonical UUID. Used to spot legacy/hand-authored ids like "st-1"
 * so they can be migrated to real UUIDs.
 * @param {any} value
 */
export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Fields to track in history
const TRACKED_FIELDS = ["sprintId", "status", "priority", "asign", "points", "blocked"];

/**
 * Create a history entry for a field change
 */
function createHistoryEntry(field, fromValue, toValue, action = "update") {
  return {
    timestamp: new Date().toISOString(),
    field,
    from: fromValue ?? null,
    to: toValue ?? null,
    action,
  };
}

/**
 * Compare old and new task data, return history entries for changes
 */
function getChangedFields(oldTask, updates) {
  const historyEntries = [];

  for (const field of TRACKED_FIELDS) {
    if (field in updates && updates[field] !== oldTask[field]) {
      historyEntries.push(
        createHistoryEntry(field, oldTask[field], updates[field])
      );
    }
  }

  return historyEntries;
}

/**
 * Normalise a subtask list coming from an import file.
 *
 * The UI renders `subtask.text`, but hand-written and third-party files commonly
 * use `title` (or `label`) instead - which renders as an empty row. Accept all
 * three and settle on `text`.
 *
 * @param {any} subtasks
 */
function normalizeSubtasks(subtasks) {
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
        // Hand-authored ids like "st-1" are replaced with real UUIDs. Subtask
        // ids are only ever referenced within their parent task, so reminting
        // them cannot break a cross-record relationship.
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
 * `assigneeId` and `tagIds` are canonical; `asign` and `tags` are kept as
 * denormalised display mirrors so existing views keep working and so an export
 * stays readable. Whichever side the caller supplied, both end up in sync.
 *
 * @param {any} task
 * @returns {any} the task with its foreign keys resolved
 */
function resolveRelations(task) {
  const patch = {};

  // --- assignee -------------------------------------------------------
  if (isUuid(task.assigneeId)) {
    const user = userStore.getById(task.assigneeId);
    if (user) patch.asign = `${user.name || ""} ${user.lastname || ""}`.trim();
  } else if (typeof task.asign === "string" && task.asign.trim()) {
    // Legacy/hand-written: only a display name. Match it to a user record.
    const user = userStore.getByFullName(task.asign);
    patch.assigneeId = user ? user.id : null;
  } else {
    patch.assigneeId = null;
  }

  // --- tags -----------------------------------------------------------
  if (Array.isArray(task.tagIds) && task.tagIds.length > 0) {
    const names = task.tagIds
      .map((id) => tagStore.getById(id)?.name)
      .filter(Boolean);
    patch.tags = names;
  } else if (Array.isArray(task.tags) && task.tags.length > 0) {
    // Names only: create any tag that does not exist yet and take its UUID
    const records = task.tags.map((name) => tagStore.ensureByName(name)).filter(Boolean);
    patch.tagIds = records.map((t) => t.id);
    patch.tags = records.map((t) => t.name);
  } else {
    patch.tagIds = [];
  }

  return { ...task, ...patch };
}

function saveTasks() {
  tasks = removeDuplicates(tasks);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
}

export const taskStore = {
  get tasks() {
    return tasks;
  },

  get hasHydrated() {
    return hasHydrated;
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const rows = Array.isArray(parsed) ? removeDuplicates(parsed) : [];

        // Migrate legacy data in place:
        //  - subtasks stored under `title` (render as blank rows)
        //  - subtask ids that are not UUIDs ("st-1")
        //  - tasks predating provenance tracking
        let migrated = false;
        tasks = rows.map((task) => {
          const patch = {};

          if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
            const normalized = normalizeSubtasks(task.subtasks);
            const changed =
              normalized.length !== task.subtasks.length ||
              normalized.some((st, i) => st.id !== task.subtasks[i]?.id || st.text !== task.subtasks[i]?.text);
            if (changed) patch.subtasks = normalized;
          }

          if (!task.origin) patch.origin = "legacy";
          if (!isUuid(task.id)) patch.id = newId();

          // Resolve name-based `asign` / `tags` into UUID foreign keys
          const withKeys = resolveRelations({ ...task, ...patch });
          if (
            withKeys.assigneeId !== task.assigneeId ||
            JSON.stringify(withKeys.tagIds) !== JSON.stringify(task.tagIds)
          ) {
            migrated = true;
            return withKeys;
          }

          if (Object.keys(patch).length === 0) return task;
          migrated = true;
          return { ...task, ...patch };
        });

        // Persist once so the migration does not re-run on every load
        if (migrated && typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }
      }
    } catch (error) {
      console.error("Failed to load tasks:", error);
      tasks = [];
    }

    hasHydrated = true;
  },

  create(taskData) {
    const now = new Date().toISOString();

    // Create initial history entry
    const initialHistory = [
      createHistoryEntry("task", null, "created", "create"),
    ];

    // If task is created directly in a sprint, track that
    if (taskData.sprintId) {
      initialHistory.push(
        createHistoryEntry("sprintId", null, taskData.sprintId, "create")
      );
    }

    const task = {
      ...taskData,
      // These are owned by the store, so they come last - a caller passing an
      // `id` must never overwrite the generated UUID (that would collide with
      // an existing task and be silently dropped by removeDuplicates)
      id: newId(),
      origin: "app",
      created: now,
      updated: now,
      history: initialHistory,
    };

    tasks = [resolveRelations(task), ...tasks];
    saveTasks();

    // Add tags to tag store for suggestions
    if (task.tags && Array.isArray(task.tags) && task.tags.length > 0) {
      tagStore.addTags(task.tags);
    }

    toastStore.success("Task created");
    return task;
  },

  update(id, updates) {
    const now = new Date().toISOString();
    const oldTask = tasks.find((t) => t.id === id);

    if (!oldTask) return;

    // Get history entries for changed fields
    const newHistoryEntries = getChangedFields(oldTask, updates);

    // Merge with existing history
    const existingHistory = Array.isArray(oldTask.history) ? oldTask.history : [];
    const updatedHistory = [...existingHistory, ...newHistoryEntries];

    tasks = tasks.map((task) =>
      task.id === id
        ? resolveRelations({ ...task, ...updates, updated: now, history: updatedHistory })
        : task
    );
    saveTasks();

    // Add tags to tag store for suggestions
    if (updates.tags && Array.isArray(updates.tags) && updates.tags.length > 0) {
      tagStore.addTags(updates.tags);
    }

    toastStore.success("Task updated");
  },

  updateStatus(id, newStatus) {
    this.update(id, { status: newStatus });
  },

  delete(id) {
    tasks = tasks.filter((task) => task.id !== id);
    saveTasks();
    toastStore.success("Task deleted");
  },

  getById(id) {
    return tasks.find((task) => task.id === id);
  },

  getByStatus(status) {
    return tasks.filter((task) => task.status === status);
  },

  getBySprint(sprintId) {
    return tasks.filter((task) => task.sprintId === sprintId);
  },

  getBacklog() {
    return tasks.filter((task) => task.status === "BACKLOG" || !task.sprintId);
  },

  toggleSubtask(taskId, subtaskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !Array.isArray(task.subtasks)) return;

    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    this.update(taskId, { subtasks: updatedSubtasks });
  },

  startTimer(taskId) {
    // Stop all other running timers
    tasks = tasks.map((task) => {
      if (task.timerRunning && task.id !== taskId) {
        const elapsed = task.elapsedSeconds || 0;
        const startedAt = task.timerStartedAt ? new Date(task.timerStartedAt).getTime() : Date.now();
        const additionalTime = Math.floor((Date.now() - startedAt) / 1000);
        return {
          ...task,
          timerRunning: false,
          elapsedSeconds: elapsed + additionalTime,
          timerStartedAt: null,
        };
      }
      return task;
    });

    // Start the timer for this task
    tasks = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            timerRunning: true,
            timerStartedAt: new Date().toISOString(),
            elapsedSeconds: task.elapsedSeconds || 0,
          }
        : task
    );
    saveTasks();
    toastStore.info("Timer started");
  },

  pauseTimer(taskId, currentElapsed) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    tasks = tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            timerRunning: false,
            elapsedSeconds: currentElapsed,
            timerStartedAt: null,
          }
        : t
    );
    saveTasks();
    toastStore.info("Timer paused");
  },

  resetTimer(taskId) {
    tasks = tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            timerRunning: false,
            elapsedSeconds: 0,
            timerStartedAt: null,
          }
        : task
    );
    saveTasks();
    toastStore.info("Timer reset");
  },

  /**
   * Merge imported tasks into the store.
   *
   * Skips tasks whose id already exists, so re-importing the same file is
   * idempotent instead of creating duplicates.
   *
   * Remaps unknown statuses and dead sprint references, so an imported task can
   * never land in a state where it belongs to no visible column and no existing
   * sprint (which would make it invisible in every view).
   *
   * A task may name its sprint with a human-readable `sprint` field instead of a
   * `sprintId` UUID, which is what makes hand-written import files practical.
   *
   * @param {any[]} incoming - Raw task objects from an export file
   * @param {{validStatuses?: string[], validSprintIds?: string[], sprintIdsByName?: Record<string, string>}} options
   * @returns {{added: number, skipped: number, remapped: number}}
   */
  importTasks(incoming, { validStatuses = [], validSprintIds = [], sprintIdsByName = {} } = {}) {
    if (!Array.isArray(incoming)) {
      return { added: 0, skipped: 0, remapped: 0 };
    }

    const existingIds = new Set(tasks.map((t) => t.id));
    const statusSet = new Set(validStatuses);
    const sprintSet = new Set(validSprintIds);

    let skipped = 0;
    let remapped = 0;
    const prepared = [];

    for (const raw of incoming) {
      // A task is only meaningful if it has a title
      if (!raw || typeof raw !== "object" || typeof raw.title !== "string" || !raw.title.trim()) {
        skipped++;
        continue;
      }

      const id = typeof raw.id === "string" && raw.id ? raw.id : newId();
      if (existingIds.has(id)) {
        skipped++;
        continue;
      }
      existingIds.add(id);

      let status = raw.status;
      if (typeof status !== "string" || !statusSet.has(status)) {
        status = "BACKLOG";
        remapped++;
      }

      // Resolve the sprint: an explicit id wins, otherwise fall back to
      // matching the human-readable `sprint` name (case/space-insensitive).
      let sprintId = raw.sprintId || null;
      if (sprintId && !sprintSet.has(sprintId)) {
        sprintId = null;
        remapped++;
      }
      if (!sprintId && typeof raw.sprint === "string" && raw.sprint.trim()) {
        const matched = sprintIdsByName[raw.sprint.trim().toLowerCase()];
        if (matched) {
          sprintId = matched;
        } else {
          remapped++;
        }
      }

      const now = new Date().toISOString();
      const existingHistory = Array.isArray(raw.history) ? raw.history : [];

      prepared.push({
        ...raw,
        id,
        status,
        sprintId,
        subtasks: normalizeSubtasks(raw.subtasks),
        // Provenance: distinguishes data that arrived from a file from data
        // created in-app. `origin` survives a re-export, so a task keeps its
        // history of where it came from.
        origin: raw.origin || "import",
        importedAt: now,
        created: raw.created || now,
        updated: now,
        history: [...existingHistory, createHistoryEntry("task", null, "imported", "import")],
      });
    }

    if (prepared.length > 0) {
      tasks = [...prepared.map(resolveRelations), ...tasks];
      saveTasks();

      const importedTags = prepared.flatMap((t) => (Array.isArray(t.tags) ? t.tags : []));
      if (importedTags.length > 0) {
        tagStore.addTags(importedTags);
      }
    }

    return { added: prepared.length, skipped, remapped };
  },

  clear() {
    tasks = [];
    saveTasks();
  },
};
