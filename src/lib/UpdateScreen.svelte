<script>
  import { fade } from "svelte/transition";
  import { Download, X } from "$lib/icons";

  let {
    visible = false,
    status = "checking",
    progress = 0,
    version = "",
    onCancel = () => {},
  } = $props();

  const statusMessages = {
    checking: "Checking for updates...",
    downloading: "Downloading update...",
    installing: "Installing update...",
    restarting: "Update complete! Restarting...",
  };

  // Can only cancel during downloading phase
  const canCancel = $derived(status === "downloading");
</script>

{#if visible}
  <div
    class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background backdrop-blur-sm"
    transition:fade={{ duration: 300 }}
  >
    <div class="flex flex-col items-center space-y-8 p-8">
      <!-- Logo/Icon Area -->
      <div class="relative">
        <div class="absolute inset-0 animate-ping opacity-20">
          <div class="h-24 w-24 rounded-full bg-primary"></div>
        </div>
        <div
          class="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary shadow-2xl shadow-primary/50"
        >
          <Download class="h-12 w-12 text-primary-foreground" strokeWidth={2} />
        </div>
      </div>

      <!-- Status Text -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-foreground mb-2">TaskFlow</h1>
        <p class="text-lg text-muted-foreground">
          {statusMessages[status]}
        </p>
      </div>

      <!-- Progress Bar -->
      <div class="w-80">
        <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style="width: {progress}%"
          ></div>
        </div>
        {#if status === "downloading" && progress > 0}
          <p class="mt-2 text-center text-sm text-muted-foreground">
            {progress}% complete
          </p>
        {/if}
      </div>

      <!-- Fun Loading Animation -->
      <div class="flex space-x-2">
        {#each Array(3) as _, i}
          <div
            class="h-2 w-2 animate-bounce rounded-full bg-primary"
            style="animation-delay: {i * 150}ms"
          ></div>
        {/each}
      </div>

      <!-- Cancel Button (only during download) -->
      {#if canCancel}
        <button
          type="button"
          class="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          onclick={onCancel}
        >
          <X size={16} />
          Cancel Update
        </button>
      {/if}
    </div>

    <!-- Version Info Footer -->
    {#if version && version.trim()}
      <div class="absolute bottom-8 text-sm text-muted-foreground">
        Version {version}
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes bounce {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-0.5rem);
    }
  }

  .animate-bounce {
    animation: bounce 1s infinite;
  }
</style>
