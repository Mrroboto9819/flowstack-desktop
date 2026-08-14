<script lang="ts">
  import { X } from "$lib/icons";
  import type { Snippet } from "svelte";

  let {
    open = false,
    title = "Modal",
    size = "md",
    onClose = () => {},
    children,
    footer,
  }: {
    open?: boolean;
    title?: string;
    size?: "sm" | "md" | "lg" | "xl";
    onClose?: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  const sizeClasses: Record<string, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  function handleClose() {
    onClose();
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <!-- Backdrop with blur -->
    <button
      type="button"
      class="absolute inset-0 bg-black/60 backdrop-blur-md transition-all"
      aria-label="Close modal"
      onclick={handleClose}
    ></button>

    <!-- Modal with solid background -->
    <div
      class={`relative z-10 flex w-full flex-col ${sizeClasses[size]} max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200`}
    >
      <!-- Header with emerald accent -->
      <header
        class="flex flex-none items-center justify-between border-b border-border px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent"
      >
        <h2
          class="text-sm font-semibold uppercase tracking-[0.2em] text-foreground flex items-center gap-2"
        >
          <span class="w-1 h-4 bg-primary rounded-full"></span>
          {title}
        </h2>
        <button
          type="button"
          class="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
          onclick={handleClose}
        >
          <X size={18} />
        </button>
      </header>

      <!-- Content -->
      <div class="overflow-y-auto px-6 py-5">
        {@render children()}
      </div>

      <!-- Footer with subtle gradient -->
      {#if footer}
        <footer class="flex-none border-t border-border px-6 py-4 bg-gradient-to-r from-muted/30 to-transparent">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}
