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
export { projectStore } from "./projects.svelte.js";

import { taskStore, setSprintProjectLookup } from "./tasks.svelte.js";
import { userStore } from "./users.svelte.js";
import { currentUserStore } from "./currentUser.svelte.js";
import { themeStore } from "./theme.svelte.js";
import { sprintStore } from "./sprints.svelte.js";
import { statusStore } from "./statuses.svelte.js";
import { settingsStore } from "./settings.svelte.js";
import { tagStore } from "./tags.svelte.js";
import { projectStore } from "./projects.svelte.js";
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
  projects: "taskflow_projects",
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
  for (const name of ["sprints", "users", "tags", "projects"]) {
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

  // Pass 2a - projectId on sprints, if the project ids were just reminted
  if (Object.keys(idMaps.projects || {}).length) {
    const sprintRows = read(STORAGE_KEYS.sprints);
    if (Array.isArray(sprintRows)) {
      let touched = false;
      const next = sprintRows.map((sprint) => {
        if (!sprint || typeof sprint !== "object") return sprint;
        const mapped = sprint.projectId && idMaps.projects[sprint.projectId];
        if (!mapped) return sprint;
        touched = true;
        return { ...sprint, projectId: mapped };
      });
      if (touched) {
        write(STORAGE_KEYS.sprints, next);
        changed = true;
      }
    }
  }

  // Pass 2b - the foreign keys on tasks
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
      if (task.projectId && idMaps.projects?.[task.projectId]) {
        patch.projectId = idMaps.projects[task.projectId];
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
 * Give existing data a home.
 *
 * Projects arrived after sprints and tasks did, so an install upgrading into
 * this version has records with no projectId. Rather than showing everything
 * as "Unassigned", mint one project and adopt the lot - the board looks the
 * same as it did before, and the project filter is useful from the first run.
 *
 * Runs on localStorage BEFORE any store hydrates, like migrateIdsToUuid, so
 * the stores never see the half-migrated shape.
 *
 * @returns {boolean} whether anything was written
 */
function migrateDefaultProject() {
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

  const existing = read(STORAGE_KEYS.projects);
  // Only ever runs once: as soon as a project exists, this is a no-op forever
  if (Array.isArray(existing) && existing.length > 0) return false;

  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    name: "Main Project",
    description: "Everything that existed before projects were introduced.",
    color: "#2dd4bf",
    status: "active",
    origin: "migration",
    created: now,
    updated: now,
  };

  write(STORAGE_KEYS.projects, [project]);

  // Adopt every sprint and task that has no project yet
  for (const key of [STORAGE_KEYS.sprints, STORAGE_KEYS.tasks]) {
    const rows = read(key);
    if (!Array.isArray(rows) || rows.length === 0) continue;
    write(
      key,
      rows.map((row) =>
        row && typeof row === "object" && !row.projectId
          ? { ...row, projectId: project.id }
          : row
      )
    );
  }

  return true;
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

  // Then make sure everything belongs to a project
  migrateDefaultProject();

  // Order matters: tasks resolve their assigneeId / tagIds / sprintId foreign
  // keys during hydration, so every record they point at must already be
  // loaded. Hydrating tasks first leaves those keys unresolved (null).
  // Wire the task -> sprint -> project derivation before any task resolves
  setSprintProjectLookup((sprintId) => sprintStore.getById(sprintId)?.projectId || null);

  userStore.hydrate();
  tagStore.hydrate();
  projectStore.hydrate();
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
  projectStore.clear();
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
      projects: [],
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

  // Strip MCP permissions from exports: they are this machine's security
  // posture, not portable board data, and a shared backup should never carry
  // someone else's access grants.
  if (exportData.data.settings && typeof exportData.data.settings === "object") {
    exportData.data.settings = { ...exportData.data.settings };
    delete exportData.data.settings.mcp;
  }

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

    // MCP permissions are a LOCAL security decision and never travel with data.
    // Both directions matter: an import must not silently switch access off
    // (a backup written before the setting existed carries settings: {}), and
    // it must not be able to switch it ON either - otherwise importing a file
    // someone sent you could grant that file's author write and delete access.
    const localMcp = settingsStore.settings.mcp;

    // Data slices go through the persistence layer so they reach the file
    for (const slice of [
      "tasks",
      "users",
      "sprints",
      "projects",
      "statuses",
      "settings",
      "tags",
    ]) {
      if (importData.data[slice] !== undefined) {
        const value =
          slice === "settings"
            ? { ...(importData.data.settings || {}), mcp: localMcp }
            : importData.data[slice];
        saveSlice(slice, value);
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
