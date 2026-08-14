<script>
  /**
   * Global project scope. Everything the app renders is filtered by whatever
   * is selected here, and anything created inherits it - which is why there is
   * deliberately no "All projects" entry: a new task created under "All" would
   * have no project to belong to. Reports opts out of the scope on its own.
   */
  import { _ } from "svelte-i18n";
  import { projectStore } from "../stores/index.js";
  import { ChevronDown, Check, Plus } from "$lib/icons";
  import { goto } from "$app/navigation";

  let { isCollapsed = false } = $props();

  let open = $state(false);
  let rootElement = $state(null);

  let current = $derived(projectStore.current);
  let options = $derived(projectStore.active);

  function select(id) {
    projectStore.setCurrent(id);
    open = false;
  }

  function manage() {
    open = false;
    goto("/projects");
  }

  // Close on outside click / Escape so the menu never strands over the board
  $effect(() => {
    if (!open) return;

    const onPointer = (event) => {
      if (rootElement && !rootElement.contains(event.target)) open = false;
    };
    const onKey = (event) => {
      if (event.key === "Escape") open = false;
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

<div bind:this={rootElement} class="relative border-t border-border px-3 py-3">
  <button
    type="button"
    onclick={() => (open = !open)}
    class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/50"
    title={isCollapsed ? current?.name || $_("projects.none") : ""}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    {#if current?.image}
      <img
        src={current.image}
        alt=""
        class="h-8 w-8 flex-shrink-0 rounded-md object-cover"
      />
    {:else}
      <span
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
        style="background-color: {current?.color || '#2dd4bf'}"
      >
        {(current?.name || "?").trim().charAt(0).toUpperCase()}
      </span>
    {/if}

    <span class="min-w-0 flex-1 overflow-hidden">
      <span class="block truncate text-sm font-medium text-sidebar-foreground">
        {current?.name || $_("projects.none")}
      </span>
      {#if current?.slogan}
        <span class="block truncate text-xs text-muted-foreground">{current.slogan}</span>
      {/if}
    </span>

    <ChevronDown size={16} class="flex-shrink-0 text-muted-foreground" />
  </button>

  {#if open}
    <div
      role="listbox"
      class="absolute bottom-full left-3 right-3 z-50 mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
    >
      {#each options as project (project.id)}
        <button
          type="button"
          role="option"
          aria-selected={project.id === projectStore.currentId}
          onclick={() => select(project.id)}
          class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/50"
        >
          {#if project.image}
            <img src={project.image} alt="" class="h-6 w-6 flex-shrink-0 rounded object-cover" />
          {:else}
            <span
              class="h-6 w-6 flex-shrink-0 rounded"
              style="background-color: {project.color || '#2dd4bf'}"
            ></span>
          {/if}
          <span class="min-w-0 flex-1 overflow-hidden">
            <span class="block truncate text-sm text-popover-foreground">{project.name}</span>
            {#if project.slogan}
              <span class="block truncate text-xs text-muted-foreground">{project.slogan}</span>
            {/if}
          </span>
          {#if project.id === projectStore.currentId}
            <Check size={16} class="flex-shrink-0 text-primary" />
          {/if}
        </button>
      {/each}

      {#if options.length === 0}
        <p class="px-3 py-2 text-sm text-muted-foreground">{$_("projects.empty")}</p>
      {/if}

      <button
        type="button"
        onclick={manage}
        class="mt-1 flex w-full items-center gap-3 border-t border-border px-3 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
      >
        <Plus size={16} class="flex-shrink-0" />
        {$_("projects.manage")}
      </button>
    </div>
  {/if}
</div>
