<script lang="ts">
  import { AlertTriangle, X } from "$lib/icons";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    onConfirm = () => {},
    onCancel = () => {},
  }: {
    open?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm?: () => void;
    onCancel?: () => void;
  } = $props();

  function handleConfirm() {
    onConfirm();
    open = false;
  }

  function handleCancel() {
    onCancel();
    open = false;
  }

  function handleClose() {
    handleCancel();
  }

  const variantStyles = {
    danger: {
      icon: "text-rose-500",
      iconBg: "bg-rose-500/10",
      button: "bg-rose-500 hover:bg-rose-600 text-white",
    },
    warning: {
      icon: "text-primary",
      iconBg: "bg-primary/10",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
    },
    info: {
      icon: "text-primary",
      iconBg: "bg-primary/10",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
    },
  };

  const styles = $derived(variantStyles[variant]);
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
      class="relative z-10 flex w-full flex-col max-w-md max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <header class="flex flex-none items-center justify-between border-b border-border px-6 py-4">
        <div class="flex items-center gap-3">
          <div class={`rounded-full p-2 ${styles.iconBg}`}>
            <AlertTriangle size={20} class={styles.icon} />
          </div>
          <h2 class="text-base font-bold text-foreground">
            {title}
          </h2>
        </div>
        <button
          type="button"
          class="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
          onclick={handleClose}
        >
          <X size={18} />
        </button>
      </header>

      <!-- Content -->
      <div class="px-6 py-5">
        <p class="text-sm text-foreground leading-relaxed">
          {message}
        </p>
      </div>

      <!-- Footer -->
      <footer class="flex-none border-t border-border px-6 py-4 bg-muted/30">
        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            class={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all shadow-sm ${styles.button}`}
            onclick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}
