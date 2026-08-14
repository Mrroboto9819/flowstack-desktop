<script>
  import { Plus, Heading, Palette } from "$lib/icons";
  import Modal from "../Modal.svelte";
  import { statusStore } from "../stores/index.js";

  let {
    open = $bindable(false),
    mode = "create",
    status = null,
  } = $props();

  let formData = $state({
    id: "",
    status: "",
    color: "#3b82f6",
  });

  const PRESET_COLORS = [
    "#94a3b8", // slate
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#84cc16", // lime
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
  ];

  // Initialize form when modal opens or status changes
  $effect(() => {
    if (open) {
      if (mode === "edit" && status) {
        formData = {
          id: status.id,
          status: status.status || "",
          color: status.color || "#3b82f6",
        };
      } else {
        formData = {
          id: "",
          status: "",
          color: "#3b82f6",
        };
      }
    }
  });

  function handleSubmit(e) {
    e.preventDefault();

    if (!formData.status.trim()) {
      alert("Status name is required");
      return;
    }

    const payload = {
      status: formData.status.trim().toUpperCase(),
      color: formData.color,
    };

    if (mode === "edit" && formData.id) {
      statusStore.update(formData.id, payload);
    } else {
      statusStore.create(payload);
    }

    closeModal();
  }

  function closeModal() {
    open = false;
  }
</script>

{#snippet modalChildren()}
  <form id="status-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Heading size={14} class="text-muted-foreground" />
        Status Name
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="IN PROGRESS"
        bind:value={formData.status}
        required
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Palette size={14} class="text-muted-foreground" />
        Color
      </div>
      <div class="mt-2 flex items-center gap-3">
        <input
          type="color"
          class="h-10 w-16 rounded-lg border border-border bg-background cursor-pointer"
          bind:value={formData.color}
        />
        <div class="flex-1 flex flex-wrap gap-2">
          {#each PRESET_COLORS as presetColor}
            <button
              type="button"
              class="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
              class:border-foreground={formData.color === presetColor}
              class:border-border={formData.color !== presetColor}
              style="background-color: {presetColor}"
              onclick={() => (formData.color = presetColor)}
              title={presetColor}
            ></button>
          {/each}
        </div>
      </div>
    </label>

    <div class="rounded-lg border border-border bg-muted/30 p-3">
      <p class="text-xs text-muted-foreground mb-2">Preview:</p>
      <div class="flex items-center gap-3">
        <div
          class="w-4 h-4 rounded-full"
          style="background-color: {formData.color}"
        ></div>
        <span class="text-sm font-semibold text-foreground">
          {formData.status || "STATUS NAME"}
        </span>
      </div>
    </div>
  </form>
{/snippet}

{#snippet modalFooter()}
  <div class="flex items-center justify-end gap-2">
    <button type="button" class="btn btn-secondary" onclick={closeModal}>
      Cancel
    </button>
    <button type="submit" form="status-form" class="btn btn-primary">
      <Plus size={16} />
      {mode === "edit" ? "Save Changes" : "Create Status"}
    </button>
  </div>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? "Edit Status" : "New Status"}
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
