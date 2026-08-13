/**
 * File-backed store for the MCP server.
 *
 * Reads and writes the same snapshot the app uses. Every mutation goes through
 * `mutate()`, which re-reads from disk first, applies the change, validates the
 * whole graph, backs up the previous file and then writes atomically.
 *
 * Atomic write matters here: the app watches this file. A partial write would
 * be read by the app mid-save and parse as corrupt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

import {
  parseSnapshot,
  validateSnapshot,
  buildSnapshot,
  emptySnapshot,
  SNAPSHOT_FILENAME,
} from "../src/lib/domain/snapshot.js";

/**
 * Where the app keeps its data. Mirrors Tauri's appDataDir for the bundle id
 * in tauri.conf.json, so both sides land on the same file.
 */
export function defaultDataDir() {
  if (process.env.FLOWSTACK_DATA_DIR) return process.env.FLOWSTACK_DATA_DIR;

  const id = "com.flowstack.app";
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", id);
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), id);
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), id);
}

export class SnapshotStore {
  /** @param {string} [dir] */
  constructor(dir = defaultDataDir()) {
    this.dir = dir;
    this.file = join(dir, SNAPSHOT_FILENAME);
    this.backupDir = join(dir, "backups");
  }

  /** @returns {any} the snapshot on disk, or an empty one */
  read() {
    if (!existsSync(this.file)) return emptySnapshot();

    const parsed = parseSnapshot(readFileSync(this.file, "utf8"));
    if (!parsed.ok) {
      throw new Error(`could not read ${this.file}: ${parsed.error}`);
    }
    return parsed.snapshot;
  }

  /**
   * Copy the current file aside before overwriting it.
   *
   * These tools can delete real work, so every destructive change is
   * recoverable. Keeps the most recent 20.
   */
  backup() {
    if (!existsSync(this.file)) return null;
    mkdirSync(this.backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = join(this.backupDir, `flowstack-${stamp}.json`);
    copyFileSync(this.file, target);

    const kept = readdirSync(this.backupDir).filter((f) => f.endsWith(".json")).sort();
    for (const old of kept.slice(0, Math.max(0, kept.length - 20))) {
      try {
        unlinkSync(join(this.backupDir, old));
      } catch {
        // a backup we cannot prune is not worth failing the write over
      }
    }
    return target;
  }

  /**
   * Apply a change to the snapshot's data and persist it.
   *
   * @param {(data: any, snapshot: any) => any} fn - receives the data section,
   *   mutates it or returns a replacement
   * @returns {{snapshot: any, backup: string|null}}
   */
  mutate(fn) {
    // Re-read every time: the app may have written since we last looked
    const current = this.read();
    const data = structuredClone(current.data);

    const result = fn(data, current) ?? data;
    const next = buildSnapshot(result, (current.revision || 0) + 1);

    const check = validateSnapshot(next);
    if (!check.ok) {
      const detail = check.problems ? ` ${JSON.stringify(check.problems.slice(0, 5))}` : "";
      throw new Error(`refusing to write: ${check.error}${detail}`);
    }

    const backup = this.backup();
    this.write(next);
    return { snapshot: next, backup };
  }

  /** Atomic write: temp file then rename, so a watcher never sees a half file. */
  write(snapshot) {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    renameSync(tmp, this.file);
  }
}
