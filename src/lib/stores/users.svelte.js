/**
 * User store - Manages team member state and CRUD operations
 */

import { toastStore } from "../toastStore.svelte.js";
import { load as loadSlice, save as saveSlice } from "../persistence.js";
import { projectStore } from "./projects.svelte.js";

/**
 * Avatar colours. Picked to stay legible against white initials in both
 * themes, and to be distinguishable from each other at avatar size.
 */
export const MEMBER_COLORS = [
  "#2dd4bf", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#ef4444", // red
  "#64748b", // slate
];

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
  saveSlice("users", users);
}

export const userStore = {
  get users() {
    return users;
  },

  hydrate() {
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
      // Cycle the palette so consecutive members never collide
      color: MEMBER_COLORS[users.length % MEMBER_COLORS.length],
      ...userData,
    };

    users = [user, ...users];
    saveUsers();
    toastStore.success("Team member added");
    return user;
  },

  /**
   * A member's avatar colour, with a stable fallback.
   *
   * Derived from the id rather than random, so a member who predates the
   * field keeps the same colour on every load instead of changing on refresh.
   *
   * @param {any} user
   */
  colorFor(user) {
    if (user?.color) return user.color;
    const id = String(user?.id || "");
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return MEMBER_COLORS[hash % MEMBER_COLORS.length];
  },

  /** The team member this install is signed in as, if one is linked. */
  get currentMember() {
    return users.find((u) => u.isCurrentUser) || null;
  },

  /**
   * Link the profile to a team member, or unlink when passed null.
   *
   * Stored as a flag on the record rather than a separate preference so the
   * profile and the roster can never drift apart - editing the member IS
   * editing the profile, which is the point.
   *
   * @param {string|null} id
   */
  setCurrentMember(id) {
    const now = new Date().toISOString();
    users = users.map((user) => {
      const isCurrent = Boolean(id) && user.id === id;
      if (Boolean(user.isCurrentUser) === isCurrent) return user;
      return { ...user, isCurrentUser: isCurrent, updated: now };
    });
    saveUsers();
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
