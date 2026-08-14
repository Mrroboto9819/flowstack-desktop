/**
 * Central store exports and initialization
 */

export { taskStore } from "./tasks.svelte.js";
export { userStore } from "./users.svelte.js";
export { currentUserStore } from "./currentUser.svelte.js";
export { themeStore } from "./theme.svelte.js";
export { sprintStore } from "./sprints.svelte.js";
export { statusStore } from "./statuses.svelte.js";
export { settingsStore } from "./settings.svelte.js";
export { tagStore } from "./tags.svelte.js";

import { taskStore } from "./tasks.svelte.js";
import { userStore } from "./users.svelte.js";
import { currentUserStore } from "./currentUser.svelte.js";
import { themeStore } from "./theme.svelte.js";
import { sprintStore } from "./sprints.svelte.js";
import { statusStore } from "./statuses.svelte.js";
import { settingsStore } from "./settings.svelte.js";
import { tagStore } from "./tags.svelte.js";
import { toastStore } from "../toastStore.svelte.js";
import { initPersistence, flushNow, persistenceInfo, save as saveSlice } from "../persistence.js";

export { persistenceInfo, flushNow };

// Storage keys for data migration
const STORAGE_KEYS = {
  tasks: "taskflow_tasks",
  users: "taskflow_users",
  sprints: "taskflow_sprints",
  statuses: "taskflow_statuses",
  settings: "taskflow_settings",
  tags: "taskflow_tags",
  userName: "userName",
  themeColor: "themeColor",
  darkMode: "darkMode",
  locale: "taskflow_locale",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

/**
 * Give every stored record a UUID, remapping the references that point at it.
 *
 * Older data (and anything hand-authored) can carry ids like "st-1", a numeric
 * index, or none at all. Those cannot be exported as a keyed relationship
 * graph. This runs BEFORE any store hydrates, directly on localStorage, so the
 * stores load already-correct data.
 *
 * Reminting an id is only safe if everything pointing at it is updated in the
 * same pass - hence the id maps and the task fix-up below.
 *
 * Statuses are deliberately excluded: their ids are semantic (BACKLOG, DONE)
 * and are matched by name across installs, so a UUID there would break imports.
 *
 * @returns {boolean} whether anything was rewritten
 */
function migrateIdsToUuid() {
  if (typeof localStorage === "undefined") return false;

  const read = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let changed = false;
  /** @type {Record<string, Record<string, string>>} */
  const idMaps = {};

  // Pass 1 - the records themselves
  for (const name of ["sprints", "users", "tags"]) {
    const rows = read(STORAGE_KEYS[name]);
    if (!Array.isArray(rows)) continue;

    /** @type {Record<string, string>} */
    const map = {};
    let touched = false;

    const next = rows.map((row) => {
      if (!row || typeof row !== "object") return row;
      if (isUuid(row.id)) return row;

      const fresh = crypto.randomUUID();
      if (row.id) map[row.id] = fresh; // remember so references can follow
      touched = true;
      return { ...row, id: fresh };
    });

    idMaps[name] = map;
    if (touched) {
      write(STORAGE_KEYS[name], next);
      changed = true;
    }
  }

  // Pass 2 - the foreign keys on tasks
  const tasks = read(STORAGE_KEYS.tasks);
  if (Array.isArray(tasks)) {
    let touched = false;

    const next = tasks.map((task) => {
      if (!task || typeof task !== "object") return task;
      const patch = {};

      if (!isUuid(task.id)) patch.id = crypto.randomUUID();
      if (task.sprintId && idMaps.sprints?.[task.sprintId]) {
        patch.sprintId = idMaps.sprints[task.sprintId];
      }
      if (task.assigneeId && idMaps.users?.[task.assigneeId]) {
        patch.assigneeId = idMaps.users[task.assigneeId];
      }
      if (Array.isArray(task.tagIds)) {
        const remapped = task.tagIds.map((id) => idMaps.tags?.[id] || id);
        if (remapped.some((id, i) => id !== task.tagIds[i])) patch.tagIds = remapped;
      }
      if (Array.isArray(task.subtasks)) {
        const subtasks = task.subtasks.map((st) =>
          st && typeof st === "object" && !isUuid(st.id)
            ? { ...st, id: crypto.randomUUID() }
            : st
        );
        if (subtasks.some((st, i) => st !== task.subtasks[i])) patch.subtasks = subtasks;
      }

      if (Object.keys(patch).length === 0) return task;
      touched = true;
      return { ...task, ...patch };
    });

    if (touched) {
      write(STORAGE_KEYS.tasks, next);
      changed = true;
    }
  }

  return changed;
}

/**
 * Initialize all stores - call this once on app mount
 */
/**
 * Load the on-disk snapshot, then hydrate every store from it.
 *
 * Must be awaited before the UI reads any store: persistence is async (the
 * Tauri fs plugin is), while the stores themselves are synchronous.
 *
 * Re-hydrates automatically when the file changes underneath us - that is how
 * an edit made by the MCP server shows up without restarting the app.
 */
export async function initApp() {
  const result = await initPersistence({
    onExternalChange: () => {
      hydrateAllStores({ silent: true });
      toastStore.info("Data updated externally", 1800);
    },
  });

  hydrateAllStores();

  if (result.migrated) {
    toastStore.success("Data moved to file storage", 2200);
  }
  return result;
}

export function hydrateAllStores(options = {}) {
  // Try to migrate any legacy data first
  migrateFromLegacyStorage();

  // Then give every record a UUID and remap references, before anything reads
  // the data - so the stores hydrate from an already-keyed graph
  migrateIdsToUuid();

  // Order matters: tasks resolve their assigneeId / tagIds / sprintId foreign
  // keys during hydration, so every record they point at must already be
  // loaded. Hydrating tasks first leaves those keys unresolved (null).
  userStore.hydrate();
  tagStore.hydrate();
  sprintStore.hydrate();
  statusStore.hydrate();
  statusStore.ensureDoneStatus(); // Ensure DONE status exists and is protected

  taskStore.hydrate();

  currentUserStore.hydrate();
  themeStore.hydrate();
  settingsStore.hydrate();

  if (!options.silent) toastStore.info("Data loaded", 1400);
}

/**
 * Clear all data - for dev/reset purposes
 */
export function clearAllStores() {
  if (typeof localStorage === "undefined") return;

  taskStore.clear();
  userStore.clear();
  sprintStore.clear();
  statusStore.clear();
  settingsStore.reset();

  toastStore.success("All data cleared");
}

/**
 * Export all app data to a JSON object
 * Used for backup/migration between app versions
 */
export function exportAllData() {
  if (typeof localStorage === "undefined") return null;

  const exportData = {
    // Metadata
    formatVersion: "1.0",
    appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
    appName: "FlowStack",
    exportedAt: new Date().toISOString(),
    platform: navigator.platform || "unknown",

    // All app data
    data: {
      tasks: [],
      users: [],
      sprints: [],
      statuses: [],
      settings: {},
      tags: [],
      preferences: {
        userName: null,
        themeColor: null,
        darkMode: null,
        locale: null,
      },
    },
  };

  // Export all storage keys
  Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
    const value = localStorage.getItem(storageKey);
    if (value !== null) {
      try {
        // Try to parse JSON data
        const parsed = JSON.parse(value);

        // Group user preferences separately
        if (["userName", "themeColor", "darkMode", "locale"].includes(key)) {
          exportData.data.preferences[key] = parsed;
        } else {
          exportData.data[key] = parsed;
        }
      } catch {
        // Store raw value for non-JSON data (like strings)
        if (["userName", "themeColor", "darkMode", "locale"].includes(key)) {
          exportData.data.preferences[key] = value;
        } else {
          exportData.data[key] = value;
        }
      }
    }
  });

  return exportData;
}

/**
 * Download exported data as a JSON file using native save dialog
 */
export async function downloadExportedData() {
  const data = exportAllData();
  if (!data) return false;

  try {
    // Try to use Tauri's native save dialog
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");

    const defaultFileName = `flowstack-backup-${new Date().toISOString().split("T")[0]}.json`;

    const filePath = await save({
      defaultPath: defaultFileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Export FlowStack Data",
    });

    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(data, null, 2));
      toastStore.success("Data exported successfully");
      return true;
    } else {
      // User cancelled
      return false;
    }
  } catch (error) {
    console.warn("Native dialog not available, using browser fallback:", error);

    // Fallback to browser download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowstack-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toastStore.success("Data exported successfully");
    return true;
  }
}

/**
 * Import data from JSON content
 * @param {string} jsonText - The JSON text to import
 * @returns {boolean} - Whether import was successful
 */
/**
 * Apply an imported backup.
 *
 * Writes through the persistence layer, NOT straight to localStorage. The
 * snapshot file is the source of truth now: writing only to localStorage would
 * be silently overwritten from the file on the reload below.
 *
 * @param {string} jsonText
 */
async function processImportData(jsonText) {
  if (typeof localStorage === "undefined") return false;

  try {
    const importData = JSON.parse(jsonText);

    if (!importData.data || typeof importData.data !== "object") {
      toastStore.error("Invalid backup file format");
      return false;
    }

    // Data slices go through the persistence layer so they reach the file
    for (const slice of ["tasks", "users", "sprints", "statuses", "settings", "tags"]) {
      if (importData.data[slice] !== undefined) {
        saveSlice(slice, importData.data[slice]);
      }
    }

    // Preferences are single values that live outside the snapshot slices
    const preferences = importData.data.preferences;
    if (preferences && typeof preferences === "object") {
      for (const [prefKey, prefValue] of Object.entries(preferences)) {
        const storageKey = STORAGE_KEYS[prefKey];
        if (storageKey && prefValue !== null) {
          localStorage.setItem(
            storageKey,
            typeof prefValue === "string" ? prefValue : JSON.stringify(prefValue)
          );
        }
      }
    }

    // Must land on disk BEFORE the reload, or startup reads the old snapshot.
    // A failure here must not lose the import: the data is already in the
    // localStorage cache, so warn and carry on rather than throwing away a
    // perfectly good file because the write failed.
    try {
      await flushNow();
    } catch (error) {
      console.error("Imported data could not be written to disk:", error);
      toastStore.warning("Imported, but could not save to disk - check file permissions");
    }

    toastStore.success("Data imported successfully. Reloading...");
    setTimeout(() => window.location.reload(), 1500);
    return true;
  } catch (error) {
    console.error("Import failed:", error);
    toastStore.error("Failed to import data. Check file format.");
    return false;
  }
}

/**
 * Import data from a File object (used by file input fallback)
 * @param {File} file - The JSON file to import
 * @returns {Promise<boolean>} - Whether import was successful
 */
export async function importDataFromFile(file) {
  try {
    const text = await file.text();
    return processImportData(text);
  } catch (error) {
    console.error("Import failed:", error);
    toastStore.error("Failed to import data. Check file format.");
    return false;
  }
}

/**
 * Import data using native file open dialog
 * @returns {Promise<boolean>} - Whether import was successful
 */
export async function importDataWithDialog() {
  try {
    // Try to use Tauri's native open dialog
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
      title: "Import FlowStack Data",
    });

    if (filePath && typeof filePath === "string") {
      const text = await readTextFile(filePath);
      return processImportData(text);
    } else {
      // User cancelled
      return false;
    }
  } catch (error) {
    console.warn("Native dialog not available:", error);
    toastStore.error("Could not open file dialog");
    return false;
  }
}

/**
 * Migrate data from old app storage (if exists)
 * Call this on app startup to handle legacy data
 */
export function migrateFromLegacyStorage() {
  if (typeof localStorage === "undefined") return;

  // Check for legacy "task-manager" prefixed keys
  const legacyMappings = {
    "task-manager_tasks": STORAGE_KEYS.tasks,
    "task-manager_users": STORAGE_KEYS.users,
    "task-manager_sprints": STORAGE_KEYS.sprints,
    "task-manager_statuses": STORAGE_KEYS.statuses,
    "task-manager_settings": STORAGE_KEYS.settings,
    "task-manager_tags": STORAGE_KEYS.tags,
  };

  let migratedCount = 0;

  Object.entries(legacyMappings).forEach(([oldKey, newKey]) => {
    const oldValue = localStorage.getItem(oldKey);
    const newValue = localStorage.getItem(newKey);

    // Only migrate if old data exists and new key is empty
    if (oldValue && !newValue) {
      localStorage.setItem(newKey, oldValue);
      migratedCount++;
    }
  });

  if (migratedCount > 0) {
    toastStore.info(`Migrated ${migratedCount} data stores from previous version`);
  }

  return migratedCount;
}
