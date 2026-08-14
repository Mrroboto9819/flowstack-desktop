import { load as loadSlice, save as saveSlice } from "../persistence.js";
/**
 * Settings store - Manages app settings
 */

const STORAGE_KEY = "taskflow_settings";

let settings = $state({
  theme: "dark",
  showScrollButtons: true,
  autoFinishSprints: false, // When true, sprints auto-complete when end date passes
  methodology: "agile", // "agile" | "kanban" | "waterfall"

  /**
   * MCP access control.
   *
   * The MCP server is a separate process, so the app cannot stop it running.
   * What it can do is own the permission: the server reads these flags out of
   * the same snapshot file on every call and refuses anything not allowed.
   * The app stays the authority.
   *
   * Defaults are deliberately cautious - reading is allowed, changing your data
   * is opt-in, and deleting is a separate opt-in on top of that.
   */
  mcp: {
    enabled: true,     // false turns every tool off, including reads
    allowWrite: false, // create and update
    allowDelete: false, // delete_task / delete_sprint
  },
});

function saveSettings() {
  saveSlice("settings", settings);
}

export const settingsStore = {
  get settings() {
    return settings;
  },

  hydrate() {
    try {
      const stored = loadSlice("settings", null);
      if (stored) {
        const parsed = stored;
        settings = { ...settings, ...parsed };
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  },

  update(updates) {
    settings = { ...settings, ...updates };
    saveSettings();
  },

  setTheme(theme) {
    settings.theme = theme;
    saveSettings();

    // Apply theme to document
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
    }
  },

  toggleScrollButtons() {
    settings.showScrollButtons = !settings.showScrollButtons;
    saveSettings();
  },

  reset() {
    settings = {
      theme: "dark",
      showScrollButtons: true,
      autoFinishSprints: false,
      methodology: "agile",
    };
    saveSettings();
  },

  setMethodology(methodology) {
    settings.methodology = methodology;
    saveSettings();
  },
};
