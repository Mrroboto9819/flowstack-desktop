/**
 * Status store - Manages status columns and CRUD operations
 */

import { toastStore } from "../toastStore.svelte.js";

const STORAGE_KEY = "taskflow_statuses";

const DEFAULT_STATUS_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#10b981",
];

const DEFAULT_STATUSES = [
  {
    id: "BACKLOG",
    status: "BACKLOG",
    color: DEFAULT_STATUS_COLORS[0],
    show: true,
    order: 0,
    isSystem: true, // Protected status for backlog workflow
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  },
  {
    id: "READY",
    status: "READY",
    color: DEFAULT_STATUS_COLORS[1],
    show: true,
    order: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  },
  {
    id: "IN PROGRESS",
    status: "IN PROGRESS",
    color: DEFAULT_STATUS_COLORS[2],
    show: true,
    order: 2,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  },
  {
    id: "REVIEW",
    status: "REVIEW",
    color: DEFAULT_STATUS_COLORS[3],
    show: true,
    order: 3,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  },
  {
    id: "DONE",
    status: "DONE",
    color: DEFAULT_STATUS_COLORS[4],
    show: true,
    order: 4,
    isSystem: true, // Protected status for reports
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  },
];

let statuses = $state([...DEFAULT_STATUSES]);

function removeDuplicates(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function saveStatuses() {
  statuses = removeDuplicates(statuses);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  }
}

export const statusStore = {
  get statuses() {
    return [...statuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  get visible() {
    return [...statuses].filter((s) => s.show).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        let loadedStatuses = Array.isArray(parsed) && parsed.length > 0
          ? removeDuplicates(parsed)
          : [...DEFAULT_STATUSES];

        // Check if any status is missing order field
        const needsOrderFix = loadedStatuses.some((status) => status.order === undefined || status.order === null);

        // Ensure all statuses have an order field
        statuses = loadedStatuses.map((status, index) => ({
          ...status,
          order: status.order ?? index,
        }));

        // If we fixed any order values, save them back to localStorage
        if (needsOrderFix) {
          saveStatuses();
        }
      } else {
        statuses = [...DEFAULT_STATUSES];
      }
    } catch (error) {
      console.error("Failed to load statuses:", error);
      statuses = [...DEFAULT_STATUSES];
    }
  },

  // Ensure system statuses (BACKLOG, DONE) always exist and are protected
  ensureSystemStatuses() {
    const systemStatuses = [
      { id: "BACKLOG", status: "BACKLOG", color: "#94a3b8", defaultOrder: 0 },
      { id: "DONE", status: "DONE", color: "#10b981", defaultOrder: 999 },
    ];

    let needsSave = false;
    const now = new Date().toISOString();

    systemStatuses.forEach(({ id, status, color, defaultOrder }) => {
      const exists = statuses.some((s) => s.id === id || s.status === status);

      if (!exists) {
        // Add missing system status
        const maxOrder = statuses.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
        statuses = [
          ...statuses,
          {
            id,
            status,
            color,
            show: true,
            order: defaultOrder === 0 ? 0 : maxOrder + 1,
            isSystem: true,
            created: now,
            updated: now,
          },
        ];
        needsSave = true;
      } else {
        // Mark existing as system (protected) if not already
        const needsProtection = statuses.some((s) => (s.id === id || s.status === status) && !s.isSystem);
        if (needsProtection) {
          statuses = statuses.map((s) =>
            s.id === id || s.status === status ? { ...s, isSystem: true } : s
          );
          needsSave = true;
        }
      }
    });

    if (needsSave) {
      saveStatuses();
    }
  },

  // Alias for backward compatibility
  ensureDoneStatus() {
    this.ensureSystemStatuses();
  },

  create(statusData) {
    const now = new Date().toISOString();
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
    const status = {
      id: statusData.status,
      created: now,
      updated: now,
      show: true,
      order: maxOrder + 1,
      ...statusData,
    };

    statuses = [...statuses, status];
    saveStatuses();
    toastStore.success("Status created");
    return status;
  },

  /**
   * Insert a status that already exists in an import file, preserving its id.
   *
   * Status ids are semantic (BACKLOG, DONE, ...) rather than UUIDs, because a
   * status is config referenced by name across installs, not an entity. Without
   * this, importing onto a cleared install loses every custom column and its
   * tasks fall back to BACKLOG.
   *
   * @param {any} status
   */
  restore(status) {
    if (!status || !status.status) return null;
    if (statuses.some((s) => s.id === status.id || s.status === status.status)) return null;

    const now = new Date().toISOString();
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.order ?? 0), -1);
    const restored = {
      show: true,
      order: maxOrder + 1,
      ...status,
      id: status.id || status.status,
      created: status.created || now,
      updated: now,
    };

    statuses = [...statuses, restored];
    saveStatuses();
    return restored;
  },

  update(id, updates) {
    const now = new Date().toISOString();
    statuses = statuses.map((status) =>
      status.id === id ? { ...status, ...updates, updated: now } : status
    );
    saveStatuses();
    toastStore.success("Status updated");
  },

  delete(id) {
    const status = this.getById(id);
    if (status?.isSystem) {
      toastStore.warning("Cannot delete system status");
      return;
    }
    statuses = statuses.filter((status) => status.id !== id);
    saveStatuses();
    toastStore.success("Status deleted");
  },

  getById(id) {
    return statuses.find((status) => status.id === id);
  },

  reset() {
    statuses = [...DEFAULT_STATUSES];
    saveStatuses();
  },

  clear() {
    statuses = [];
    saveStatuses();
  },

  reorder(fromIndex, toIndex) {
    console.log(`StatusStore reorder: moving index ${fromIndex} to ${toIndex}`);
    const sorted = this.statuses; // Already sorted by order

    if (fromIndex < 0 || fromIndex >= sorted.length || toIndex < 0 || toIndex >= sorted.length) {
      console.warn("StatusStore reorder: Invalid indices", { fromIndex, toIndex, length: sorted.length });
      return;
    }

    const [removed] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, removed);

    // Update order for all statuses
    statuses = sorted.map((status, index) => ({
      ...status,
      order: index,
      updated: new Date().toISOString(),
    }));

    saveStatuses();
    toastStore.success("Status order updated");
  },

  updateOrder(newItems) {
    console.log("StatusStore: updateOrder called", newItems.length);
    statuses = newItems.map((status, index) => ({
      ...status,
      order: index,
      updated: new Date().toISOString(),
    }));
    saveStatuses();
    // Toast is handled by dnd interaction or user might find it too spammy if it happens on drop
    // But let's keep it for feedback
    toastStore.success("Status order updated");
  },

  // Fix order values for all statuses (useful for migration/debugging)
  fixOrder() {
    statuses = statuses.map((status, index) => ({
      ...status,
      order: index,
      updated: new Date().toISOString(),
    }));
    saveStatuses();
    toastStore.success("Status order fixed");
  },
};
