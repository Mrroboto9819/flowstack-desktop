/**
 * Persistence layer.
 *
 * The app used to write each store straight to localStorage. That has three
 * problems: it is capped at ~5MB, it is wiped by "clear site data", and nothing
 * outside the webview can read it - which is why the MCP server could not see
 * your board.
 *
 * Now a single JSON snapshot on disk is the source of truth, written through
 * Tauri's fs plugin. localStorage stays only as a synchronous cache so the
 * stores can keep their existing sync API.
 *
 *   read:  disk -> cache -> stores        (once, at startup)
 *   write: stores -> cache -> disk        (debounced, atomic)
 *
 * In a plain browser (`vite dev`) there is no fs plugin, so it degrades to
 * localStorage only and everything still works.
 */

import { SNAPSHOT_FILENAME, buildSnapshot, parseSnapshot } from "./domain/snapshot.js";

/** Slice name -> localStorage key, kept for backwards compatibility. */
const LEGACY_KEYS = {
  tasks: "taskflow_tasks",
  users: "taskflow_users",
  sprints: "taskflow_sprints",
  projects: "taskflow_projects",
  statuses: "taskflow_statuses",
  settings: "taskflow_settings",
  tags: "taskflow_tags",
};

const SLICES = Object.keys(LEGACY_KEYS);

/** In-memory copy of the snapshot's data section. */
let cache = null;
let revision = 0;
let backend = "memory"; // "tauri" | "localStorage" | "memory"
let flushTimer = null;
let onExternalChange = null;

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

/** Resolve the Tauri fs plugin, or null when running in a plain browser. */
async function tauriFs() {
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const path = await import("@tauri-apps/api/path");
    // Throws outside Tauri, which is exactly how we detect the environment
    const dir = await path.appDataDir();
    // appDataDir() has NO trailing separator - join() rather than string
    // concatenation, or the path lands beside the data dir instead of inside it
    // (and outside the fs scope, so the write is denied)
    return { fs, dir, join: path.join };
  } catch {
    return null;
  }
}

/** Everything currently in localStorage, in snapshot shape. */
function readLegacyLocalStorage() {
  const data = {};
  for (const [slice, key] of Object.entries(LEGACY_KEYS)) {
    try {
      const raw = localStorage.getItem(key);
      data[slice] = raw ? JSON.parse(raw) : slice === "settings" ? {} : [];
    } catch {
      data[slice] = slice === "settings" ? {} : [];
    }
  }
  data.preferences = {
    userName: localStorage.getItem("userName"),
    themeColor: localStorage.getItem("themeColor"),
    darkMode: localStorage.getItem("darkMode"),
    locale: localStorage.getItem("taskflow_locale"),
  };
  return data;
}

/** Mirror the cache into localStorage so stores can read it synchronously. */
function writeCacheToLocalStorage() {
  if (!isBrowser() || !cache) return;
  for (const [slice, key] of Object.entries(LEGACY_KEYS)) {
    if (cache[slice] === undefined) continue;
    try {
      localStorage.setItem(key, JSON.stringify(cache[slice]));
    } catch {
      // quota or private mode - disk is still the source of truth
    }
  }
}

const hasContent = (d) =>
  Boolean(d) && SLICES.some((s) => Array.isArray(d[s]) ? d[s].length > 0 : d[s] && Object.keys(d[s]).length > 0);

/**
 * Load the snapshot into memory. Call once, before any store hydrates.
 *
 * On first run the on-disk file will not exist, so whatever is already in
 * localStorage is adopted and written out - an existing install keeps its data.
 *
 * @param {{onExternalChange?: () => void}} [options]
 */
export async function initPersistence(options = {}) {
  onExternalChange = options.onExternalChange || null;

  const tauri = await tauriFs();

  if (!tauri) {
    backend = isBrowser() ? "localStorage" : "memory";
    cache = isBrowser() ? readLegacyLocalStorage() : {};
    return { backend, migrated: false };
  }

  backend = "tauri";
  const { fs, dir, join } = tauri;
  const file = await join(dir, SNAPSHOT_FILENAME);

  let migrated = false;
  let onDisk = null;

  try {
    if (await fs.exists(file)) {
      const parsed = parseSnapshot(await fs.readTextFile(file));
      if (parsed.ok) {
        onDisk = parsed.snapshot.data;
        revision = parsed.snapshot.revision || 0;
      }
    }
  } catch (error) {
    console.error("Could not read snapshot, falling back to localStorage:", error);
  }

  if (hasContent(onDisk)) {
    cache = onDisk;
    writeCacheToLocalStorage(); // keep the sync cache in step with disk
  } else {
    // First run on this machine: adopt whatever localStorage already holds
    cache = isBrowser() ? readLegacyLocalStorage() : {};
    migrated = hasContent(cache);
    try {
      await flushNow();
    } catch (error) {
      // Cannot write to the app data dir (permissions, sandbox). Keep running
      // on localStorage rather than failing to start - the user's data is
      // still there, it just is not visible to the MCP server yet.
      console.error("Could not write the snapshot, staying on localStorage:", error);
      backend = "localStorage";
      migrated = false;
    }
  }

  await startWatching(fs, dir, file);
  return { backend, migrated, file };
}

/**
 * Pull in a newer revision written by something else (the MCP server).
 * Returns true when the in-memory cache actually moved forward.
 */
async function adoptIfNewer(fs, file) {
  try {
    const parsed = parseSnapshot(await fs.readTextFile(file));
    // Only react to revisions we did not write ourselves
    if (parsed.ok && (parsed.snapshot.revision || 0) > revision) {
      cache = parsed.snapshot.data;
      revision = parsed.snapshot.revision || 0;
      writeCacheToLocalStorage();
      onExternalChange();
      return true;
    }
  } catch {
    // a half-written file will fire again on the next event
  }
  return false;
}

/**
 * Re-hydrate when something else rewrites the file.
 *
 * Watches the *directory*, not the file. The MCP server writes atomically
 * (temp file + rename), which swaps the inode out from under a file-level
 * watch - that watch then goes deaf after the very first external change.
 * A directory watch keeps firing because the directory itself is never
 * replaced. A slow revision poll backs it up in case the platform delivers
 * no event at all.
 */
async function startWatching(fs, dir, file) {
  if (!onExternalChange) return;

  if (typeof fs.watch === "function") {
    try {
      await fs.watch(
        dir,
        async (event) => {
          const paths = Array.isArray(event?.paths) ? event.paths : [];
          // Ignore churn from the backups/ subfolder and the temp write file
          if (paths.length && !paths.some((p) => p.endsWith(SNAPSHOT_FILENAME))) return;
          await adoptIfNewer(fs, file);
        },
        { delayMs: 250, recursive: false }
      );
    } catch (error) {
      console.warn("Directory watching unavailable, falling back to polling:", error);
    }
  }

  // Backstop: a read costs well under a millisecond, so a slow poll is far
  // cheaper than a board that silently stops updating.
  setInterval(() => {
    adoptIfNewer(fs, file);
  }, 4000);
}

/**
 * Read a slice. Synchronous, so stores keep their existing shape.
 * @param {string} slice
 * @param {any} fallback
 */
export function load(slice, fallback) {
  if (cache && cache[slice] !== undefined) return cache[slice];

  // Before init, or in a plain browser, fall back to the legacy key
  if (isBrowser()) {
    try {
      const raw = localStorage.getItem(LEGACY_KEYS[slice]);
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

/**
 * Write a slice: cache and localStorage immediately, disk shortly after.
 * @param {string} slice
 * @param {any} value
 */
export function save(slice, value) {
  cache ??= {};
  cache[slice] = value;

  if (isBrowser() && LEGACY_KEYS[slice]) {
    try {
      localStorage.setItem(LEGACY_KEYS[slice], JSON.stringify(value));
    } catch {
      /* disk still wins */
    }
  }

  scheduleFlush();
}

/** Batch the several saves a single user action triggers into one file write. */
function scheduleFlush() {
  if (backend !== "tauri") return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushNow().catch((e) => console.error("Snapshot write failed:", e));
  }, 300);
}

/** Write the cache to disk now. Temp file then rename, so no partial reads. */
export async function flushNow() {
  if (backend !== "tauri" || !cache) return false;

  const tauri = await tauriFs();
  if (!tauri) return false;

  const { fs, dir, join } = tauri;
  const file = await join(dir, SNAPSHOT_FILENAME);
  const tmp = `${file}.tmp`;

  revision += 1;
  const snapshot = buildSnapshot(cache, revision);

  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // already exists
  }

  await fs.writeTextFile(tmp, JSON.stringify(snapshot, null, 2));
  await fs.rename(tmp, file);
  return true;
}

/** Where the data lives, for the About screen and diagnostics. */
export function persistenceInfo() {
  return { backend, revision, slices: SLICES };
}
