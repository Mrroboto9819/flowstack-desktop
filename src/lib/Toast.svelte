<script>
  import { onMount } from "svelte";
  import { CheckCircle, AlertCircle, Info, X } from "$lib/icons";
  import { fade, fly } from "svelte/transition";

  let {
    message = "",
    type = "success",
    duration = 3000,
    onClose = () => {},
  } = $props();

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
  };

  const styles = {
    success: "bg-primary text-primary-foreground border-primary",
    error: "bg-destructive text-destructive-foreground border-destructive",
    info: "bg-info text-info-foreground border-info",
  };

  let Icon = $derived(icons[type] || icons.info);

  onMount(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  });
</script>

<div
  class={`flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg ${styles[type]}`}
  transition:fly={{ y: 50, duration: 300 }}
>
  <Icon size={20} class="flex-shrink-0" />
  <p class="flex-1 text-sm font-medium">{message}</p>
  <button
    type="button"
    onclick={onClose}
    class="flex-shrink-0 rounded p-1 hover:bg-black/10 transition-colors"
    aria-label="Close notification"
  >
    <X size={16} />
  </button>
</div>
