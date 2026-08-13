import { toastStore } from "../toastStore.svelte.js";

const STORAGE_KEY_THEME = "themeColor";

// Define HSL values for each theme
const THEMES = {
    emerald: {
        primary: "160 84% 39%",
    },
    blue: {
        primary: "217 91% 60%",
    },
    violet: {
        primary: "263 90% 66%",
    },
    rose: {
        primary: "350 89% 60%",
    },
    amber: {
        primary: "38 92% 50%",
    },
    cyan: {
        primary: "189 94% 43%",
    },
};

const DEFAULT_THEME = "emerald";

let currentTheme = $state(DEFAULT_THEME);

// Apply the theme immediately on module load (before any rendering).
// Falls back to DEFAULT_THEME when nothing is saved - a fresh install has no
// stored value, and skipping this left --primary undefined, which made every
// primary-coloured element render white.
if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    const initial = saved && saved in THEMES ? saved : DEFAULT_THEME;

    // @ts-ignore - initial is always a valid THEMES key
    const color = THEMES[initial];
    document.documentElement.style.setProperty("--primary", color.primary, "important");
    document.documentElement.style.setProperty("--ring", color.primary, "important");
    document.documentElement.style.setProperty("--sidebar-primary", color.primary, "important");
    document.documentElement.style.setProperty("--sidebar-ring", color.primary, "important");
    document.documentElement.style.setProperty("--emerald", color.primary, "important");
    currentTheme = initial;
}

export const themeStore = {
    get current() {
        return currentTheme;
    },

    hydrate() {
        // Theme is already applied above, this is just for consistency
        if (typeof localStorage === "undefined") return;
        const stored = localStorage.getItem(STORAGE_KEY_THEME);
        currentTheme = stored && stored in THEMES ? stored : DEFAULT_THEME;
    },

    /**
     * @param {string} themeName
     * @param {boolean} save
     */
    setTheme(themeName, save = true) {
        if (!(themeName in THEMES)) return;

        currentTheme = themeName;

        // Apply CSS variables (only in browser)
        if (typeof document !== "undefined") {
            // @ts-ignore - themeName is validated above with `in` check
            const color = THEMES[themeName];
            const root = document.documentElement;

            // Update all related primary variables with !important to override CSS defaults
            root.style.setProperty("--primary", color.primary, "important");
            root.style.setProperty("--ring", color.primary, "important");
            root.style.setProperty("--sidebar-primary", color.primary, "important");
            root.style.setProperty("--sidebar-ring", color.primary, "important");
            root.style.setProperty("--emerald", color.primary, "important");
        }

        if (save && typeof localStorage !== "undefined") {
            localStorage.setItem(STORAGE_KEY_THEME, themeName);
            toastStore.success(`Theme set to ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}`);
        }
    }
};
