<script>
  import { Wrench, ChevronDown } from "$lib/icons";
  import { clickOutside } from "../clickOutside.js";

  /**
   * @typedef {Object} ToolItem
   * @property {string} label
   * @property {any} [icon] - lucide-svelte component
   * @property {string} [description]
   * @property {boolean} [separatorBefore]
   * @property {() => void | Promise<void>} onSelect
   */

  let {
    label = "Tools",
    /** @type {ToolItem[]} */
    items = [],
  } = $props();

  let open = $state(false);
  let menuId = "tools-menu";

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  async function select(item) {
    // Close first so the menu never sits on top of a native file dialog
    close();
    await item.onSelect();
  }

  function handleKeydown(e) {
    if (e.key === "Escape" && open) {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="relative" use:clickOutside={close}>
  <button
    type="button"
    class="btn btn-secondary"
    onclick={toggle}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={menuId}
  >
    <Wrench size={14} />
    {label}
    <ChevronDown
      size={14}
      class="transition-transform duration-200 {open ? 'rotate-180' : ''}"
    />
  </button>

  {#if open}
    <div
      id={menuId}
      role="menu"
      class="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
    >
      {#each items as item (item.label)}
        {#if item.separatorBefore}
          <div class="my-1 h-px bg-border" role="separator"></div>
        {/if}
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary focus:outline-none"
          onclick={() => select(item)}
        >
          {#if item.icon}
            <item.icon size={16} class="mt-0.5 shrink-0" />
          {/if}
          <span class="flex flex-col">
            <span class="font-medium">{item.label}</span>
            {#if item.description}
              <span class="text-xs text-muted-foreground">{item.description}</span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
