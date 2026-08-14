<script lang="ts">
  import "../app.css";
  import { onMount, type Snippet } from "svelte";
  import { Minus, Square, X, Moon, Sun, Download } from "$lib/icons";
  import ToastContainer from "../lib/ToastContainer.svelte";
  import Sidebar from "../lib/components/Sidebar.svelte";
  import ProjectGate from "../lib/components/ProjectGate.svelte";
  import UpdateScreen from "../lib/UpdateScreen.svelte";
  import ConfirmModal from "../lib/components/ConfirmModal.svelte";
  import LanguageSelector from "../lib/components/LanguageSelector.svelte";
  import { initApp, clearAllStores, sprintStore, projectStore } from "../lib/stores/index.js";
  import { appState } from "../lib/stores/app.svelte.js";
  import { page } from "$app/stores";
  import SplashScreen from "../lib/components/SplashScreen.svelte";
  import { _ } from "$lib/i18n";

  let { children } = $props();

  let appWindow: any = $state(null);
  let darkMode = $state(true);
  let mounted = $state(false);
  let isMac = $state(false);
  let isLinux = $state(false);
  let sidebarCollapsed = $state(false);

  // Routes whose content only makes sense inside a project. Everything else
  // (projects, team, reports, settings) stays reachable so there is always a
  // way to create the first one.
  const PROJECT_SCOPED = ["/tasks", "/backlog", "/sprints", "/sprint"];
  let needsProject = $derived(
    projectStore.projects.length === 0 &&
      PROJECT_SCOPED.includes($page.url.pathname)
  );
  let contentElement: HTMLElement | undefined = $state();

  // Update screen state
  let updateVisible = $state(false);
  let updateStatus = $state<"checking" | "downloading" | "installing" | "restarting">("checking");
  let updateProgress = $state(0);
  let updateVersion = $state("");

  // Update confirmation modal state
  let updateModalOpen = $state(false);
  let pendingUpdate: any = $state(null);
  let relaunchFn: (() => Promise<void>) | null = $state(null);
  let updateSkipped = $state(false); // Track if user skipped the update

  onMount(async () => {
    mounted = true;

    // Detect platform (macOS vs Windows vs Linux)
    const platform = navigator.platform.toLowerCase();
    isMac = platform.includes('mac');
    isLinux = platform.includes('linux');

    // Initialize all stores.
    // Async: the on-disk snapshot has to load before stores hydrate, so
    // everything that reads store data waits on it - checkAutoFinish included,
    // which would otherwise run against an empty sprint list.
    initApp()
      .then(() => {
        sprintStore.checkAutoFinish();
        appState.setReady();
      })
      .catch((error) => {
        console.error("Startup failed:", error);
        appState.setBootError("Could not load your data. Working from the local cache.");
      });

    // Try to get Tauri window (will fail gracefully in browser)
    try {
      // Dynamic import to avoid SSR issues if any, though onMount is browser-only.
      // Using logic from user's example
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      appWindow = getCurrentWindow();
    } catch {
      // Running in browser, not Tauri
    }

    // Load dark mode preference
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode !== null) {
      darkMode = savedDarkMode === "true";
    } else {
      darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    applyDarkMode();

    // Setup Tauri updater
    setupUpdater();

    // Add keyboard shortcuts for dev testing
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+U - Test update screen
      if (e.ctrlKey && e.shiftKey && e.key === "U") {
        e.preventDefault();
        testUpdateScreen();
      }
      // Ctrl+Shift+M - Toggle Mac/Windows controls
      if (e.ctrlKey && e.shiftKey && e.key === "M") {
        e.preventDefault();
        isMac = !isMac;
        console.log(`Window controls: ${isMac ? 'macOS' : 'Windows'} style`);
      }
      // Ctrl+Shift+R - Reset all data (dev only)
      if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key === "R") {
        e.preventDefault();
        if (confirm("Reset all data? This cannot be undone.")) {
          clearAllStores();
          window.location.reload();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  async function setupUpdater() {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");

      // Check for updates on app start
      const update = await check();

      if (update?.available) {
        // Store the update and relaunch function for later use
        pendingUpdate = update;
        relaunchFn = relaunch;
        updateVersion = update.version || "";

        // Show confirmation modal to ask user
        updateModalOpen = true;
      }
    } catch (error) {
      console.error("Update check failed:", error);
      updateVisible = false;
    }
  }

  async function handleUpdateConfirm() {
    if (!pendingUpdate) return;

    // For Linux, open GitHub releases page instead of auto-update
    if (isLinux) {
      updateModalOpen = false;
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl("https://github.com/Mrroboto9819/FlowStack-desktop/releases/latest");
      } catch {
        // Fallback to window.open if opener plugin not available
        window.open("https://github.com/Mrroboto9819/FlowStack-desktop/releases/latest", "_blank");
      }
      updateSkipped = true; // Keep the indicator visible for later
      return;
    }

    if (!relaunchFn) return;

    // Close modal and show download screen
    updateModalOpen = false;
    updateVisible = true;
    updateStatus = "downloading";

    try {
      // Track download progress
      let downloaded = 0;
      let contentLength = 0;

      // Download and install the update
      await pendingUpdate.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            updateStatus = "downloading";
            contentLength = event.data.contentLength || 0;
            downloaded = 0;
            updateProgress = 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              updateProgress = Math.round((downloaded / contentLength) * 100);
            }
            break;
          case "Finished":
            updateStatus = "installing";
            updateProgress = 100;
            break;
        }
      });

      updateStatus = "restarting";
      // Wait a moment before restarting
      setTimeout(() => {
        relaunchFn?.();
      }, 1000);
    } catch (error) {
      console.error("Update installation failed:", error);
      updateVisible = false;
    }
  }

  function handleUpdateCancel() {
    // User declined, mark as skipped but keep the update available
    updateSkipped = true;
  }

  function handleDownloadCancel() {
    // User canceled during download
    updateVisible = false;
    updateProgress = 0;
    updateStatus = "checking";
    updateSkipped = true; // Show the indicator so they can retry
  }

  function showUpdateModal() {
    // Re-show the update modal (when user clicks the skipped update indicator)
    // For Linux, we only need pendingUpdate (no relaunchFn needed since we just open URL)
    if (pendingUpdate && (relaunchFn || isLinux)) {
      updateSkipped = false;
      updateModalOpen = true;
    }
  }

  // Test function for development - simulates the full update flow
  function testUpdateScreen() {
    updateVersion = "2.0.0";
    updateSkipped = false;
    // Show the confirmation modal first (like real flow)
    updateModalOpen = true;

    // Mock the pending update for testing
    pendingUpdate = {
      downloadAndInstall: async (callback: any) => {
        callback({ event: "Started", data: { contentLength: 100 } });
        let progress = 0;
        await new Promise<void>((resolve, reject) => {
          const interval = setInterval(() => {
            // Check if download was cancelled
            if (!updateVisible) {
              clearInterval(interval);
              reject(new Error("Cancelled"));
              return;
            }
            progress += 10;
            callback({ event: "Progress", data: { chunkLength: 10 } });
            if (progress >= 100) {
              clearInterval(interval);
              callback({ event: "Finished", data: {} });
              resolve();
            }
          }, 200);
        });
      }
    };
    relaunchFn = async () => {
      // In test mode, just hide the screen after "restarting"
      setTimeout(() => {
        updateVisible = false;
        pendingUpdate = null;
        relaunchFn = null;
      }, 2000);
    };
  }

  function applyDarkMode() {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.remove("dark");
    }
    localStorage.setItem("darkMode", darkMode.toString());
  }

  function toggleDarkMode() {
    darkMode = !darkMode;
    applyDarkMode();
  }

  const minimize = () => appWindow?.minimize();
  const toggleMaximize = () => appWindow?.toggleMaximize();
  const close = () => appWindow?.close();
</script>

{#if !appState.ready}
  <SplashScreen error={appState.bootError} />
{/if}

<div class="app-shell">
  <!-- Custom Titlebar -->
  <header class="titlebar" data-tauri-drag-region>
    <!-- Mac Traffic Light Controls (left side) -->
    {#if appWindow && isMac}
      <div class="titlebar__mac-controls" data-tauri-drag-region="false">
        <button
          class="titlebar__traffic-light titlebar__traffic-light--close"
          type="button"
          onclick={close}
          title={$_("titlebar.close")}
        >
          <X size={8} class="titlebar__traffic-light-icon" />
        </button>
        <button
          class="titlebar__traffic-light titlebar__traffic-light--minimize"
          type="button"
          onclick={minimize}
          title={$_("titlebar.minimize")}
        >
          <Minus size={8} class="titlebar__traffic-light-icon" />
        </button>
        <button
          class="titlebar__traffic-light titlebar__traffic-light--maximize"
          type="button"
          onclick={toggleMaximize}
          title={$_("titlebar.maximize")}
        >
          <Square size={6} class="titlebar__traffic-light-icon" />
        </button>
      </div>
    {/if}

    <div class="titlebar__brand" data-tauri-drag-region>
      <div class="titlebar__dot"></div>
      <span class="tracking-wide" data-tauri-drag-region>FlowStack</span>
    </div>
    <div class="titlebar__actions" data-tauri-drag-region="false">
      <LanguageSelector />
      <button
        class="titlebar__btn"
        type="button"
        onclick={toggleDarkMode}
        title={$_("titlebar.toggleTheme")}
      >
        {#if darkMode}
          <Sun size={14} />
        {:else}
          <Moon size={14} />
        {/if}
      </button>
      <!-- Windows/Linux Controls (right side) -->
      {#if appWindow && !isMac}
        <button class="titlebar__btn" type="button" onclick={minimize}>
          <Minus size={14} />
        </button>
        <button class="titlebar__btn" type="button" onclick={toggleMaximize}>
          <Square size={14} />
        </button>
        <button
          class="titlebar__btn titlebar__btn--close"
          type="button"
          onclick={close}
        >
          <X size={14} />
        </button>
      {/if}
    </div>
  </header>

  <!-- Sidebar Navigation -->
  <Sidebar bind:isCollapsed={sidebarCollapsed} {contentElement} />

  <!-- Main Content -->
  <div bind:this={contentElement} class="app-body pl-64 overflow-y-auto">
    {#if needsProject}
      <ProjectGate />
    {:else}
      {@render children()}
    {/if}
  </div>

  <!-- Version Tag & Update Indicator -->
  <div class="fixed bottom-2 right-4 z-50 flex items-center gap-2">
    {#if updateSkipped && pendingUpdate}
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:scale-105 animate-pulse"
        onclick={showUpdateModal}
        title="Update available - click to install"
      >
        <Download size={12} />
        {$_("update.available", { values: { version: updateVersion } })}
      </button>
    {/if}
    <div class="pointer-events-none opacity-40 text-[10px] text-muted-foreground font-mono select-none">
      v{__APP_VERSION__}
    </div>
  </div>

  <!-- Toast Notifications -->
  <ToastContainer />

  <!-- Update Screen -->
  <UpdateScreen
    visible={updateVisible}
    status={updateStatus}
    progress={updateProgress}
    version={updateVersion}
    onCancel={handleDownloadCancel}
  />

  <!-- Update Confirmation Modal -->
  <ConfirmModal
    bind:open={updateModalOpen}
    title={$_("update.title")}
    message={isLinux ? $_("update.linuxMessage", { values: { version: updateVersion } }) : $_("update.message", { values: { version: updateVersion } })}
    confirmText={isLinux ? $_("update.openDownloads") : $_("update.updateNow")}
    cancelText={$_("update.later")}
    variant="info"
    onConfirm={handleUpdateConfirm}
    onCancel={handleUpdateCancel}
  />
</div>
