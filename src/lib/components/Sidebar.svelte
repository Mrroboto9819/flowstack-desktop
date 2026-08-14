<script lang="ts">
  import { onMount } from "svelte";
  import { gsap } from "gsap";
  import {
    KanbanSquare,
    Clipboard,
    Layers3,
    Users,
    Settings,
    Calendar,
    ChevronLeft,
    ChevronRight,
    User,
    ChevronDown,
    LogIn,
    SlidersHorizontal,
    BarChart3,
    Info,
    Briefcase,
  } from "$lib/icons";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { currentUserStore, settingsStore } from "../stores/index.js";
  import ProjectSwitcher from "./ProjectSwitcher.svelte";
  import { projectStore } from "../stores/index.js";
  import { _ } from "$lib/i18n";

  // Get methodology from settings
  let methodology = $derived(settingsStore.settings.methodology || "agile");

  // Define all nav items with methodology visibility
  // `group` says whether a view is scoped by the sidebar project switcher.
  // Kept as one flat, ordered list rather than nested arrays so the index that
  // labelElements binds against stays stable - the headers are rendered where
  // the group changes.
  const ALL = ["agile", "kanban", "waterfall"];
  const allNavItems = [
    // /sprint was merged into /sprints - one page now holds the active sprint
    // board and the sprint list, so there is a single nav entry for it
    { href: "/sprints", labelKey: "nav.sprints", icon: KanbanSquare, methodologies: ["agile"], group: "project" },
    { href: "/tasks", labelKey: "nav.tasks", icon: Clipboard, methodologies: ALL, group: "project" },
    { href: "/backlog", labelKey: "nav.backlog", icon: Layers3, methodologies: ["agile", "kanban"], group: "project" },
    { href: "/projects", labelKey: "nav.projects", icon: Briefcase, methodologies: ALL, group: "global" },
    { href: "/team", labelKey: "nav.team", icon: Users, methodologies: ALL, group: "global" },
    { href: "/reports", labelKey: "nav.reports", icon: BarChart3, methodologies: ALL, group: "global" },
    { href: "/settings", labelKey: "nav.boardSettings", icon: Settings, methodologies: ALL, group: "global" },
    { href: "/about", labelKey: "nav.about", icon: Info, methodologies: ALL, group: "global" },
  ];

  // Filter nav items based on current methodology
  let navItems = $derived(
    allNavItems.filter((item) => item.methodologies.includes(methodology))
  );

  let { isCollapsed = $bindable(false), contentElement = undefined } = $props();
  let sidebarElement: HTMLElement | undefined;
  let labelElements: (HTMLElement | undefined)[] = [];
  let dropdownOpen = $state(false);
  let showComingSoonModal = $state(false);
  let dropdownPosition = $state({ top: 0, left: 0, right: "auto" });
  let profileButtonElement: HTMLElement | undefined;

  // Get user name from store
  let userName = $derived(currentUserStore.name);

  onMount(() => {
    // Load saved state (default to expanded)
    // const saved = localStorage.getItem("sidebarCollapsed");
    // if (saved !== null) {
    //   isCollapsed = saved === "true";
    // } else {
    isCollapsed = false; // Default to expanded
    // }

    // Apply initial state without animation
    if (sidebarElement) {
      gsap.set(sidebarElement, { width: isCollapsed ? 72 : 256 });
      labelElements.forEach((el) => {
        if (el) {
          if (isCollapsed) {
            gsap.set(el, { opacity: 0, display: "none" });
          } else {
            gsap.set(el, { opacity: 1, display: "block" });
          }
        }
      });
    }
    if (contentElement) {
      gsap.set(contentElement, { paddingLeft: isCollapsed ? 72 : 256 });
    }
  });

  function toggleSidebar() {
    if (!sidebarElement) return;

    isCollapsed = !isCollapsed;
    localStorage.setItem("sidebarCollapsed", isCollapsed.toString());

    const timeline = gsap.timeline();

    if (isCollapsed) {
      // Collapse animation
      timeline
        .to(labelElements.filter(Boolean), {
          opacity: 0,
          duration: 0.15,
          ease: "power2.in",
        })
        .set(labelElements.filter(Boolean), { display: "none" });

      // Animate sidebar
      timeline.to(
        sidebarElement,
        {
          width: 72,
          duration: 0.3,
          ease: "power3.inOut",
        },
        "<0.1",
      );

      // Animate content if it exists
      if (contentElement) {
        timeline.to(
          contentElement,
          {
            paddingLeft: 72,
            duration: 0.3,
            ease: "power3.inOut",
          },
          "<",
        );
      }
    } else {
      // Expand animation - animate sidebar
      timeline.to(sidebarElement, {
        width: 256,
        duration: 0.3,
        ease: "power3.inOut",
      });

      // Animate content if it exists
      if (contentElement) {
        timeline.to(
          contentElement,
          {
            paddingLeft: 256,
            duration: 0.3,
            ease: "power3.inOut",
          },
          "<",
        );
      }

      timeline.set(labelElements.filter(Boolean), { display: "block" }).to(
        labelElements.filter(Boolean),
        {
          opacity: 1,
          duration: 0.2,
          ease: "power2.out",
        },
        "<0.15",
      );
    }
  }

  function handleSignUp() {
    dropdownOpen = false;
    showComingSoonModal = true;
  }

  function handlePreferences() {
    dropdownOpen = false;
    goto("/preferences");
  }

  function getInitials(name: string) {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function toggleDropdown() {
    if (!profileButtonElement) return;

    dropdownOpen = !dropdownOpen;

    if (dropdownOpen) {
      // Calculate position
      const rect = profileButtonElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownHeight = 120; // Approximate dropdown height
      const dropdownWidth = 200; // Approximate dropdown width

      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;

      // Determine horizontal position (left or right of sidebar)
      const collapsed = sidebarElement
        ? sidebarElement.offsetWidth < 100
        : false;

      if (collapsed) {
        // When collapsed, align dropdown to the right of the profile button
        let horizontalPos = rect.right + 2;
        let verticalPos;

        // Check if dropdown would go off-screen horizontally
        if (horizontalPos + dropdownWidth > viewportWidth) {
          // Not enough space to the right, position to the left
          horizontalPos = rect.left - dropdownWidth - 8;
        }

        // Vertical positioning - align top with button top, but adjust if it goes off-screen
        if (rect.top + dropdownHeight > viewportHeight) {
          // Would go off-screen at bottom, align bottom of dropdown with bottom of button
          verticalPos = Math.max(8, rect.bottom - dropdownHeight);
        } else {
          // Align top of dropdown with top of button
          verticalPos = rect.top;
        }

        dropdownPosition = {
          top: verticalPos,
          left: horizontalPos,
          right: "auto",
        };
      } else {
        // When expanded, also show to the right (flyout style) as requested
        // Align bottom of dropdown with bottom of button by default for sidebar footer
        // But check space like in collapsed mode

        let horizontalPos = rect.right + 2;
        let verticalPos;
        const dropdownHeight = 120; // Approximate
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const dropdownWidth = 200;

        // Check if dropdown would go off-screen horizontally
        if (horizontalPos + dropdownWidth > viewportWidth) {
          // If no space on right, align inside (right aligned to button)
          horizontalPos = rect.right - dropdownWidth;
        }

        // Vertical positioning
        if (rect.top + dropdownHeight > viewportHeight) {
          // Align bottom
          verticalPos = Math.max(8, rect.bottom - dropdownHeight);
        } else {
          // Align top
          verticalPos = rect.top;
        }

        dropdownPosition = {
          top: verticalPos,
          left: horizontalPos,
          right: "auto",
        };
      }
    }
  }
</script>

<aside
  bind:this={sidebarElement}
  class="fixed left-0 top-10 bottom-0 w-64 border-r border-border bg-sidebar transition-shadow z-40 flex flex-col"
  class:shadow-xl={isCollapsed}
>
  <!-- Toggle button -->
  <div class="flex items-center justify-end p-3 border-b border-border">
    <button
      type="button"
      onclick={toggleSidebar}
      class="p-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
      title={isCollapsed ? $_("sidebar.expandSidebar") : $_("sidebar.collapseSidebar")}
    >
      {#if isCollapsed}
        <ChevronRight size={18} />
      {:else}
        <ChevronLeft size={18} />
      {/if}
    </button>
  </div>

  <nav class="p-4 space-y-1 flex-1 overflow-y-auto">
    {#each navItems as item, index}
      {@const isActive = $page.url.pathname === item.href}
      {@const Icon = item.icon}
      {#if !isCollapsed && item.group !== navItems[index - 1]?.group}
        <p
          class="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground {index ===
          0
            ? ''
            : 'pt-4'}"
        >
          {item.group === "project"
            ? $_("nav.groupProject", { values: { name: projectStore.current?.name || "" } })
            : $_("nav.groupGlobal")}
        </p>
      {/if}
      <a
        href={item.href}
        class="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors group relative {isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'}"
        title={isCollapsed ? $_(item.labelKey) : ""}
      >
        <Icon size={18} class="flex-shrink-0" />
        <span
          bind:this={labelElements[index]}
          class="whitespace-nowrap overflow-hidden"
        >
          {$_(item.labelKey)}
        </span>
      </a>
    {/each}
  </nav>

  <ProjectSwitcher {isCollapsed} />

  <!-- User Profile Section -->
  <div class="border-t border-border p-4">
    <button
      bind:this={profileButtonElement}
      type="button"
      class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
      onclick={toggleDropdown}
      title={isCollapsed ? userName : ""}
    >
      <div
        class="w-8 h-8 rounded-full bg-primary/20 border-2 border-primary/30 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0"
      >
        {getInitials(userName)}
      </div>
      {#if !isCollapsed}
        <div class="flex-1 text-left min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {userName}
          </p>
          <p class="text-xs text-muted-foreground">{$_("sidebar.freeAccount")}</p>
        </div>
        <ChevronDown
          size={16}
          class="text-muted-foreground flex-shrink-0 {dropdownOpen
            ? 'rotate-180'
            : ''}"
          style="transition: transform 0.2s"
        />
      {/if}
    </button>
  </div>
</aside>

<!-- Dropdown Menu - Fixed positioned outside sidebar -->
{#if dropdownOpen}
  <!-- Backdrop to close dropdown when clicking outside -->
  <button
    type="button"
    class="fixed inset-0 z-[60]"
    onclick={() => (dropdownOpen = false)}
    aria-label="Close dropdown"
  ></button>

  <!-- Dropdown content -->
  <div
    class="fixed z-[70] min-w-[200px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
    style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
  >
    <button
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors"
      onclick={handleSignUp}
    >
      <LogIn size={16} class="text-muted-foreground" />
      {$_("sidebar.signUp")}
    </button>
    <button
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors border-t border-border"
      onclick={handlePreferences}
    >
      <SlidersHorizontal size={16} class="text-muted-foreground" />
      {$_("sidebar.preferences")}
    </button>
  </div>
{/if}

<!-- Coming Soon Modal -->
{#if showComingSoonModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <button
      type="button"
      class="absolute inset-0 bg-black/60 backdrop-blur-md"
      aria-label="Close modal"
      onclick={() => (showComingSoonModal = false)}
    ></button>

    <div
      class="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
    >
      <div class="text-center">
        <div
          class="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4"
        >
          <Settings size={32} class="text-primary" />
        </div>
        <h2 class="text-xl font-bold text-foreground mb-2">{$_("sidebar.comingSoon.title")}</h2>
        <p class="text-sm text-muted-foreground mb-6">
          {$_("sidebar.comingSoon.message")}
        </p>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => (showComingSoonModal = false)}
        >
          {$_("sidebar.comingSoon.button")}
        </button>
      </div>
    </div>
  </div>
{/if}
