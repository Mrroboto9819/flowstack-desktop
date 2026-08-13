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
});

function saveSettings() {
  if (typeof localStorage !== "undefined") {
    saveSlice("settings", settings);
  }
}

export const settingsStore = {
  get settings() {
    return settings;
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;

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
