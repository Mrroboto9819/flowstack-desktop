<script>
  import { Play, Pause, RotateCcw, Timer } from "$lib/icons";
  import { onMount } from "svelte";

  let {
    taskId,
    elapsedSeconds = 0,
    /** ISO timestamp of when the running session began; null when paused. */
    timerStartedAt = null,
    isRunning = false,
    onStart = () => {},
    onPause = () => {},
    onReset = () => {},
    compact = false,
  } = $props();

  /**
   * Wall-clock ticker.
   *
   * The display is DERIVED from `timerStartedAt`, never incremented. Counting
   * +1 per interval tick lost time in two ways: a page reload restarted the
   * count from the last banked value (so a running timer appeared to reset),
   * and browsers throttle setInterval in background tabs, so it drifted behind
   * real time even without a reload. `now` only exists to re-trigger the
   * computation once a second.
   */
  let now = $state(Date.now());

  $effect(() => {
    if (!isRunning) return;

    now = Date.now();
    const id = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(id);
  });

  let displaySeconds = $derived.by(() => {
    const banked = elapsedSeconds || 0;
    if (!isRunning || !timerStartedAt) return banked;
    const startedAt = new Date(timerStartedAt).getTime();
    return banked + Math.max(0, Math.floor((now - startedAt) / 1000));
  });

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function handleStart() {
    onStart(taskId);
  }

  function handlePause() {
    // No elapsed value passed - the store computes it from timerStartedAt
    onPause(taskId);
  }

  function handleReset() {
    onReset(taskId);
  }
</script>

{#if compact}
  <!-- Compact version for task cards -->
  <div class="flex items-center gap-1.5">
    <Timer size={10} class="text-muted-foreground" />
    <span class="text-[10px] font-mono text-muted-foreground">
      {formatTime(displaySeconds)}
    </span>
    {#if isRunning}
      <button
        type="button"
        class="rounded p-0.5 hover:bg-muted transition-colors"
        onclick={handlePause}
        title="Pause timer"
      >
        <Pause size={10} class="text-primary" />
      </button>
    {:else}
      <button
        type="button"
        class="rounded p-0.5 hover:bg-muted transition-colors"
        onclick={handleStart}
        title="Start timer"
      >
        <Play size={10} class="text-muted-foreground" />
      </button>
    {/if}
  </div>
{:else}
  <!-- Full version for detail modal -->
  <div class="space-y-3">
    <div class="flex items-center justify-center">
      <div class={`text-4xl font-mono font-bold ${isRunning ? "text-primary" : "text-foreground"}`}>
        {formatTime(displaySeconds)}
      </div>
    </div>

    <div class="flex items-center justify-center gap-2">
      {#if isRunning}
        <button
          type="button"
          class="btn btn-secondary px-4 py-2"
          onclick={handlePause}
        >
          <Pause size={16} />
          Pause
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-primary px-4 py-2"
          onclick={handleStart}
        >
          <Play size={16} />
          Start
        </button>
      {/if}

      {#if displaySeconds > 0}
        <button
          type="button"
          class="btn btn-ghost px-4 py-2"
          onclick={handleReset}
        >
          <RotateCcw size={16} />
          Reset
        </button>
      {/if}
    </div>
  </div>
{/if}
