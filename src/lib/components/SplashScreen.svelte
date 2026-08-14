<script>
  import { fade } from "svelte/transition";

  let { message = "Loading your board", error = null } = $props();
</script>

<!-- Sits above everything until the snapshot has loaded. Uses theme tokens, so
     it matches light and dark without a flash of the wrong background. -->
<div
  class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
  out:fade={{ duration: 220 }}
  role="status"
  aria-live="polite"
>
  <div class="flex flex-col items-center gap-5">
    <!-- Mark: a small board whose columns fill in sequence -->
    <div class="flex items-end gap-1.5" aria-hidden="true">
      {#each [0, 1, 2, 3] as i}
        <span
          class="w-2.5 rounded-full bg-primary"
          style="height: {[18, 30, 24, 14][i]}px; animation: splash-pulse 1.1s ease-in-out {i * 0.12}s infinite;"
        ></span>
      {/each}
    </div>

    <div class="text-center">
      <p class="text-lg font-bold tracking-tight text-foreground">FlowStack</p>
      {#if error}
        <p class="mt-1 max-w-xs text-xs text-rose-500">{error}</p>
      {:else}
        <p class="mt-1 text-xs text-muted-foreground">{message}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes splash-pulse {
    0%,
    100% {
      opacity: 0.25;
      transform: scaleY(0.7);
    }
    50% {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  /* Respect the user's motion preference: hold the bars steady instead */
  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none !important;
      opacity: 0.6;
    }
  }
</style>
