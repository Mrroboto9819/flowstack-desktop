<script>
  import { Plus, X, Check } from "$lib/icons";

  let {
    value = $bindable([]),
  } = $props();

  let newSubtaskText = $state("");

  // Ensure value is always an array
  $effect(() => {
    if (!Array.isArray(value)) {
      value = [];
    }
  });

  function addSubtask() {
    const text = newSubtaskText.trim();
    if (!text) return;

    value = [
      ...value,
      {
        id: crypto.randomUUID(),
        text,
        completed: false,
      },
    ];
    newSubtaskText = "";
  }

  function removeSubtask(id) {
    value = value.filter((st) => st.id !== id);
  }

  function toggleSubtask(id) {
    value = value.map((st) =>
      st.id === id ? { ...st, completed: !st.completed } : st
    );
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSubtask();
    }
  }
</script>

<div class="space-y-3">
  <!-- Add new subtask -->
  <div class="flex gap-2">
    <input
      type="text"
      class="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      placeholder="Add a subtask..."
      bind:value={newSubtaskText}
      onkeydown={handleKeyDown}
    />
    <button
      type="button"
      class="btn btn-primary px-3"
      onclick={addSubtask}
      disabled={!newSubtaskText.trim()}
    >
      <Plus size={16} />
    </button>
  </div>

  <!-- Subtask list -->
  {#if value.length > 0}
    <div class="space-y-2">
      {#each value as subtask (subtask.id)}
        <div
          class="flex items-center gap-2 rounded-lg border border-border bg-background p-2 transition-all hover:border-primary/50"
        >
          <button
            type="button"
            class={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all ${
              subtask.completed
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:border-primary"
            }`}
            onclick={() => toggleSubtask(subtask.id)}
          >
            {#if subtask.completed}
              <Check size={12} />
            {/if}
          </button>
          <span
            class={`flex-1 text-sm ${
              subtask.completed
                ? "text-muted-foreground line-through"
                : "text-foreground"
            }`}
          >
            {subtask.text}
          </span>
          <button
            type="button"
            class="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all"
            onclick={() => removeSubtask(subtask.id)}
          >
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
