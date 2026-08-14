/**
 * Tag store - Manages tags used in tasks for auto-suggestion
 */

import { toastStore } from "../toastStore.svelte.js";
import { load as loadSlice, save as saveSlice } from "../persistence.js";

const STORAGE_KEY = "taskflow_tags";

const DEFAULT_TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
];

let tags = $state([]);

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

function saveTags() {
  tags = removeDuplicates(tags);
  saveSlice("tags", tags);
}

export const tagStore = {
  get tags() {
    return tags;
  },

  hydrate() {
    try {
      const stored = loadSlice("tags", null);
      if (stored) {
        const parsed = stored;
        // Migrate old string array to new object format
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === "string") {
            // Old format - convert to new format
            tags = parsed.map((name, index) => ({
              id: newId(),
              name: name,
              color: DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length],
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            }));
            saveTags(); // Save in new format
          } else {
            // New format
            tags = removeDuplicates(parsed);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load tags:", error);
      tags = [];
    }
  },

  create(tagData) {
    const now = new Date().toISOString();
    const tag = {
      id: newId(),
      created: now,
      updated: now,
      color: DEFAULT_TAG_COLORS[tags.length % DEFAULT_TAG_COLORS.length],
      ...tagData,
    };

    tags = [...tags, tag];
    saveTags();
    toastStore.success("Tag created");
    return tag;
  },

  update(id, updates) {
    const now = new Date().toISOString();
    tags = tags.map((tag) =>
      tag.id === id ? { ...tag, ...updates, updated: now } : tag
    );
    saveTags();
    toastStore.success("Tag updated");
  },

  delete(id) {
    tags = tags.filter((tag) => tag.id !== id);
    saveTags();
    toastStore.success("Tag deleted");
  },

  /**
   * Insert a tag that already has an id, preserving it.
   * @param {any} tag
   */
  restore(tag) {
    if (!tag || !tag.id || tags.some((t) => t.id === tag.id)) return null;

    const now = new Date().toISOString();
    const restored = {
      color: DEFAULT_TAG_COLORS[tags.length % DEFAULT_TAG_COLORS.length],
      ...tag,
      origin: tag.origin || "import",
      importedAt: now,
      created: tag.created || now,
      updated: now,
    };

    tags = [...tags, restored];
    saveTags();
    return restored;
  },

  /**
   * Find a tag by name (case-insensitive), creating it when absent.
   * Returns the tag, so callers can store its UUID rather than its name.
   * @param {string} name
   */
  ensureByName(name) {
    if (typeof name !== "string" || !name.trim()) return null;
    const wanted = name.trim();
    const existing = tags.find(
      (t) => (t.name || "").trim().toLowerCase() === wanted.toLowerCase()
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const tag = {
      id: newId(),
      name: wanted,
      color: DEFAULT_TAG_COLORS[tags.length % DEFAULT_TAG_COLORS.length],
      origin: "app",
      created: now,
      updated: now,
    };
    tags = [...tags, tag];
    saveTags();
    return tag;
  },

  /**
   * The colour registered for a tag name.
   *
   * Task cards carry tag *names* (the denormalised mirror), not ids, so a
   * name lookup is what the views actually need. Falls back to the palette by
   * a hash of the name, so a tag that predates the colour field still renders
   * consistently rather than switching colour between loads.
   *
   * @param {string} name
   */
  colorForName(name) {
    const wanted = String(name || "").trim().toLowerCase();
    const found = tags.find((t) => (t.name || "").trim().toLowerCase() === wanted);
    if (found?.color) return found.color;

    let hash = 0;
    for (let i = 0; i < wanted.length; i += 1) hash = (hash * 31 + wanted.charCodeAt(i)) >>> 0;
    return DEFAULT_TAG_COLORS[hash % DEFAULT_TAG_COLORS.length];
  },

  getById(id) {
    return tags.find((tag) => tag.id === id);
  },

  // Legacy method - kept for backward compatibility with task creation
  addTags(newTags) {
    if (!Array.isArray(newTags) || newTags.length === 0) return;

    const cleanTags = newTags.map(t => t.trim().toLowerCase()).filter(Boolean);

    cleanTags.forEach(tagName => {
      const exists = tags.find(t => t.name.toLowerCase() === tagName);
      if (!exists) {
        this.create({ name: tagName });
      }
    });
  },

  clear() {
    tags = [];
    saveTags();
  },

  getSuggestions(input) {
    if (!input) return tags;
    const searchTerm = input.toLowerCase().trim();
    return tags.filter(tag => tag.name.toLowerCase().includes(searchTerm));
  },

  // Get tag names for backward compatibility with tasks
  get tagNames() {
    return tags.map(t => t.name);
  }
};
