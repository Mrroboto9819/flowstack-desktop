/**
 * The on-disk snapshot: the shared contract between the app and the MCP server.
 *
 * Plain JS with no browser or Node APIs, so both sides import the same file.
 * Reading and writing the actual file is each side's own job - the app uses
 * `@tauri-apps/plugin-fs`, the MCP server uses `node:fs`.
 */

import { isUuid, newId, removeDuplicates, findDanglingReferences } from "./entities.js";

export const SNAPSHOT_VERSION = "1.0";

/** The file the app and the MCP server agree on. */
export const SNAPSHOT_FILENAME = "flowstack.json";

/**
 * Build a snapshot from the current data.
 *
 * `revision` is what makes concurrent editing safe: a writer must pass the
 * revision it read. If the file moved on in between, the write is rejected
 * instead of silently overwriting whatever the other side did.
 *
 * @param {{tasks?: any[], sprints?: any[], projects?: any[], users?: any[], tags?: any[], statuses?: any[], settings?: any, preferences?: any}} data
 * @param {number} revision
 */
export function buildSnapshot(data, revision = 0) {
  return {
    formatVersion: SNAPSHOT_VERSION,
    appName: "FlowStack",
    kind: "snapshot",
    revision,
    updatedAt: new Date().toISOString(),
    data: {
      // Carry through anything this build does not know about.
      //
      // Without this the shape below acts as a whitelist, and a writer running
      // older code silently deletes every slice added since it was started -
      // which is exactly how a long-lived MCP server process wiped the whole
      // projects array on its next write. Losing data to a version skew is far
      // worse than persisting a key we cannot interpret.
      ...data,
      tasks: data.tasks || [],
      sprints: data.sprints || [],
      projects: data.projects || [],
      users: data.users || [],
      tags: data.tags || [],
      statuses: data.statuses || [],
      settings: data.settings || {},
      preferences: data.preferences || {},
    },
  };
}

/** An empty but structurally valid snapshot. */
export function emptySnapshot() {
  return buildSnapshot({}, 0);
}

/**
 * Parse and repair a snapshot read from disk.
 *
 * Accepts the snapshot format, the whole-app backup format (`data.tasks`) and
 * the task-only export format (`tasks`), so any file the app has ever written
 * can be opened.
 *
 * @param {string|object} input
 * @returns {{ok: true, snapshot: any} | {ok: false, error: string}}
 */
export function parseSnapshot(input) {
  let raw;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `not valid JSON: ${e.message}` };
    }
  } else {
    raw = input;
  }

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "snapshot must be an object" };
  }

  // Whichever shape it is, end up with the same inner data object
  const data = raw.data && typeof raw.data === "object"
    ? raw.data
    : Array.isArray(raw.tasks)
      ? {
          tasks: raw.tasks,
          sprints: raw.sprints,
          projects: raw.projects,
          users: raw.users,
          tags: raw.tags,
          statuses: raw.statuses,
        }
      : null;

  if (!data) return { ok: false, error: "no recognisable data section" };

  const clean = {
    tasks: removeDuplicates(Array.isArray(data.tasks) ? data.tasks : []),
    sprints: removeDuplicates(Array.isArray(data.sprints) ? data.sprints : []),
    projects: removeDuplicates(Array.isArray(data.projects) ? data.projects : []),
    users: removeDuplicates(Array.isArray(data.users) ? data.users : []),
    tags: removeDuplicates(Array.isArray(data.tags) ? data.tags : []),
    statuses: Array.isArray(data.statuses) ? data.statuses : [],
    settings: data.settings || {},
    preferences: data.preferences || {},
  };

  // Anything without a UUID gets one. Statuses are excluded on purpose - their
  // ids are semantic (BACKLOG, DONE) and matched by name across installs.
  for (const key of ["tasks", "sprints", "projects", "users", "tags"]) {
    clean[key] = clean[key].map((row) => (isUuid(row?.id) ? row : { ...row, id: newId() }));
  }

  const revision = Number.isFinite(raw.revision) ? raw.revision : 0;
  return { ok: true, snapshot: buildSnapshot(clean, revision) };
}

/**
 * Check a snapshot before it is written.
 *
 * A write that introduces a dangling reference is refused: that is exactly how
 * a task ends up belonging to no sprint and invisible in every view.
 *
 * @param {any} snapshot
 * @returns {{ok: true} | {ok: false, error: string, problems?: any[]}}
 */
export function validateSnapshot(snapshot) {
  const data = snapshot?.data;
  if (!data) return { ok: false, error: "snapshot has no data section" };

  for (const key of ["tasks", "sprints", "projects", "users", "tags"]) {
    const rows = data[key] || [];
    const bad = rows.filter((r) => !isUuid(r?.id));
    if (bad.length > 0) {
      return { ok: false, error: `${bad.length} ${key} without a valid uuid` };
    }
    const ids = new Set(rows.map((r) => r.id));
    if (ids.size !== rows.length) {
      return { ok: false, error: `duplicate ids in ${key}` };
    }
  }

  const problems = findDanglingReferences(data);
  if (problems.length > 0) {
    return {
      ok: false,
      error: `${problems.length} dangling reference(s) would be written`,
      problems,
    };
  }

  return { ok: true };
}

/**
 * Guard against a lost update.
 *
 * The app and the MCP server can both hold the file open. A writer passes the
 * revision it based its edit on; if disk has moved past that, the caller must
 * re-read and reapply rather than clobber.
 *
 * @param {number} onDisk
 * @param {number} expected
 */
export function isStaleWrite(onDisk, expected) {
  return Number.isFinite(expected) && expected < onDisk;
}
