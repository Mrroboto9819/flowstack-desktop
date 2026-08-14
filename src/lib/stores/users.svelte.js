/**
 * User store - Manages team member state and CRUD operations
 */

import { toastStore } from "../toastStore.svelte.js";
import { load as loadSlice, save as saveSlice } from "../persistence.js";
import { projectStore } from "./projects.svelte.js";

const STORAGE_KEY = "taskflow_users";

let users = $state([]);

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

function saveUsers() {
  users = removeDuplicates(users);
  if (typeof localStorage !== "undefined") {
    saveSlice("users", users);
  }
}

export const userStore = {
  get users() {
    return users;
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = loadSlice("users", null);
      if (stored) {
        const parsed = stored;
        users = Array.isArray(parsed) ? removeDuplicates(parsed) : [];
      }
    } catch (error) {
      console.error("Failed to load users:", error);
      users = [];
    }
  },

  create(userData) {
    const now = new Date().toISOString();
    const user = {
      id: newId(),
      created: now,
      updated: now,
      // People are on many projects, so membership is a list. A new member
      // joins whatever project is currently in scope.
      projectIds: projectStore.currentId ? [projectStore.currentId] : [],
      ...userData,
    };

    users = [user, ...users];
    saveUsers();
    toastStore.success("Team member added");
    return user;
  },

  /** Add or remove this member from a project. */
  setProjectMembership(id, projectId, isMember) {
    const now = new Date().toISOString();
    users = users.map((user) => {
      if (user.id !== id) return user;
      const current = Array.isArray(user.projectIds) ? user.projectIds : [];
      const next = isMember
        ? [...new Set([...current, projectId])]
        : current.filter((p) => p !== projectId);
      return { ...user, projectIds: next, updated: now };
    });
    saveUsers();
  },

  update(id, updates) {
    const now = new Date().toISOString();
    users = users.map((user) =>
      user.id === id ? { ...user, ...updates, updated: now } : user
    );
    saveUsers();
    toastStore.success("Team member updated");
  },

  delete(id) {
    users = users.filter((user) => user.id !== id);
    saveUsers();
    toastStore.success("Team member removed");
  },

  /**
   * Insert a user that already has an id, preserving it.
   * Used by import so task -> user relationships hold by UUID across installs.
   * @param {any} user
   */
  restore(user) {
    if (!user || !user.id || users.some((u) => u.id === user.id)) return null;

    const now = new Date().toISOString();
    const restored = {
      ...user,
      origin: user.origin || "import",
      importedAt: now,
      created: user.created || now,
      updated: now,
    };

    users = [...users, restored];
    saveUsers();
    return restored;
  },

  /**
   * Find a user by their display name ("Name Lastname"), case-insensitive.
   * Backs the migration from the old name-based `asign` field to `assigneeId`.
   * @param {string} fullName
   */
  getByFullName(fullName) {
    if (typeof fullName !== "string" || !fullName.trim()) return undefined;
    const wanted = fullName.trim().toLowerCase();
    return users.find(
      (u) => `${u.name || ""} ${u.lastname || ""}`.trim().toLowerCase() === wanted
    );
  },

  getById(id) {
    return users.find((user) => user.id === id);
  },

  clear() {
    users = [];
    saveUsers();
  },
};
