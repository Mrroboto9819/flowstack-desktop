/**
 * Project store - the top of the hierarchy. Sprints and tasks belong to a
 * project; a task with no sprint (backlog) still carries its own projectId,
 * which is why the field lives on both.
 */

import { toastStore } from "../toastStore.svelte.js";
import { load as loadSlice, save as saveSlice } from "../persistence.js";

const DEFAULT_PROJECT_COLORS = [
  "#2dd4bf", // teal - the app primary
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#f59e0b", // amber
];

let projects = $state([]);

/**
 * The project the whole UI is scoped to. Everything rendered is filtered by
 * it, and anything created (task, sprint) inherits it - so this selector is
 * what actually defines the relationship, not a per-item picker.
 *
 * A per-machine view choice rather than board data, so it lives beside the
 * other single-value preferences instead of in the snapshot slices.
 */
const CURRENT_KEY = "taskflow_current_project";
let currentProjectId = $state(null);

function newId() {
  return crypto.randomUUID();
}

function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function saveProjects() {
  projects = removeDuplicates(projects);
  if (typeof localStorage !== "undefined") {
    saveSlice("projects", projects);
  }
}

export const projectStore = {
  get projects() {
    return projects;
  },

  /** Projects that are not archived - what pickers should offer. */
  get active() {
    return projects.filter((p) => p.status !== "archived");
  },

  /** The project everything is currently scoped to, or null for "all". */
  get currentId() {
    return currentProjectId;
  },

  get current() {
    return projects.find((p) => p.id === currentProjectId) || null;
  },

  /** @param {string|null} id */
  setCurrent(id) {
    currentProjectId = id || null;

    // Mirror the choice onto the records themselves. localStorage is invisible
    // to any other process, so without this the MCP server has no way to know
    // which project new work should belong to.
    projects = projects.map((p) => ({ ...p, isActive: p.id === currentProjectId }));
    saveProjects();

    if (typeof localStorage === "undefined") return;
    if (currentProjectId) localStorage.setItem(CURRENT_KEY, currentProjectId);
    else localStorage.removeItem(CURRENT_KEY);
  },

  /**
   * True when the record belongs to the current scope.
   *
   * Handles both shapes: tasks and sprints live in exactly one project
   * (`projectId`), while people are usually on several (`projectIds`) - a
   * single id there would mean duplicating a person per project.
   *
   * Records carrying no project at all stay visible, so nothing can become
   * unreachable through filtering.
   *
   * @param {any} record
   */
  inScope(record) {
    if (!currentProjectId || !record) return true;

    if (Array.isArray(record.projectIds)) {
      return record.projectIds.length === 0 || record.projectIds.includes(currentProjectId);
    }
    return !record.projectId || record.projectId === currentProjectId;
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = loadSlice("projects", null);
      if (stored) {
        projects = Array.isArray(stored) ? removeDuplicates(stored) : [];
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
      projects = [];
    }

    // Restore the scope. The flag on the record wins over localStorage, since
    // it travels with the data and is what the MCP server reads.
    const flagged = projects.find((p) => p.isActive);
    const saved = localStorage.getItem(CURRENT_KEY);

    if (flagged) {
      currentProjectId = flagged.id;
      localStorage.setItem(CURRENT_KEY, currentProjectId);
    } else if (saved && projects.some((p) => p.id === saved)) {
      currentProjectId = saved;
      this.setCurrent(saved); // stamp the flag so the MCP can see it too
    } else if (projects.length > 0) {
      this.setCurrent(projects[0].id);
    } else {
      currentProjectId = null;
    }
  },

  create(projectData = {}) {
    const now = new Date().toISOString();
    const project = {
      name: "Untitled project",
      slogan: "",
      image: null,
      description: "",
      color: DEFAULT_PROJECT_COLORS[projects.length % DEFAULT_PROJECT_COLORS.length],
      status: "active",
      ...projectData,
      // Store-owned fields come last so a caller cannot overwrite the generated
      // UUID and collide with an existing project
      id: newId(),
      origin: "app",
      created: now,
      updated: now,
    };

    projects = [...projects, project];
    saveProjects();
    toastStore.success("Project created");
    return project;
  },

  /**
   * Insert a project that already has an id, preserving it.
   *
   * Used by import so a project referenced by an export file is recreated under
   * its original UUID and the sprint/task -> project relationships hold by id.
   *
   * @param {any} project
   */
  restore(project) {
    if (!project || !project.id || projects.some((p) => p.id === project.id)) return null;

    const now = new Date().toISOString();
    const restored = {
      name: "Untitled project",
      slogan: "",
      image: null,
      status: "active",
      ...project,
      origin: project.origin || "import",
      importedAt: now,
      created: project.created || now,
      updated: now,
    };

    projects = [...projects, restored];
    saveProjects();
    return restored;
  },

  update(id, updates) {
    const now = new Date().toISOString();
    projects = projects.map((project) =>
      project.id === id ? { ...project, ...updates, updated: now } : project
    );
    saveProjects();
    toastStore.success("Project updated");
  },

  archive(id) {
    this.update(id, { status: "archived" });
  },

  /**
   * Delete a project. Sprints and tasks that pointed at it are unassigned
   * rather than orphaned - a dangling projectId would render as a blank
   * filter chip and never be reachable again.
   *
   * Callers pass the detach hooks so this store stays free of import cycles.
   *
   * @param {string} id
   * @param {{detachSprints?: (id: string) => number, detachTasks?: (id: string) => number}} [hooks]
   */
  delete(id, hooks = {}) {
    const sprintCount = hooks.detachSprints ? hooks.detachSprints(id) : 0;
    const taskCount = hooks.detachTasks ? hooks.detachTasks(id) : 0;

    projects = projects.filter((project) => project.id !== id);
    saveProjects();

    // Never leave the UI scoped to a project that no longer exists
    if (currentProjectId === id) this.setCurrent(projects[0]?.id || null);

    if (sprintCount || taskCount) {
      toastStore.info(
        `Project deleted. ${taskCount} task(s) and ${sprintCount} sprint(s) are now unassigned`
      );
    } else {
      toastStore.success("Project deleted");
    }
  },

  getById(id) {
    return projects.find((project) => project.id === id);
  },

  getByName(name) {
    if (!name) return undefined;
    const wanted = String(name).trim().toLowerCase();
    return projects.find((project) => (project.name || "").trim().toLowerCase() === wanted);
  },

  clear() {
    projects = [];
    saveProjects();
  },
};
