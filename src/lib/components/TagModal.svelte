<script>
  import { Plus, Tag, Palette } from "$lib/icons";
  import Modal from "../Modal.svelte";
  import { tagStore } from "../stores/index.js";

  let {
    open = $bindable(false),
    mode = "create",
    tag = null,
  } = $props();

  let formData = $state({
    id: "",
    name: "",
    color: "#3b82f6",
  });

  const PRESET_COLORS = [
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#84cc16", // lime
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#64748b", // slate
  ];

  // Initialize form when modal opens or tag changes
  $effect(() => {
    if (open) {
      if (mode === "edit" && tag) {
        formData = {
          id: tag.id,
          name: tag.name || "",
          color: tag.color || "#3b82f6",
        };
      } else {
        formData = {
          id: "",
          name: "",
          color: "#3b82f6",
        };
      }
    }
  });

  function handleSubmit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Tag name is required");
      return;
    }

    const payload = {
      name: formData.name.trim().toLowerCase(),
      color: formData.color,
    };

    if (mode === "edit" && formData.id) {
      tagStore.update(formData.id, payload);
    } else {
      tagStore.create(payload);
    }

    closeModal();
  }

  function closeModal() {
    open = false;
  }
</script>

{#snippet modalChildren()}
  <form id="tag-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Tag size={14} class="text-muted-foreground" />
        Tag Name
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="bug, feature, urgent"
        bind:value={formData.name}
        required
      />
      <p class="mt-1 text-xs text-muted-foreground">
        Tags are automatically converted to lowercase
      </p>
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
      <div class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
        style="background-color: {formData.color}15; border-color: {formData.color}40; color: {formData.color}"
      >
        <Tag size={10} />
        {formData.name || "tag-name"}
      </div>
    </div>
  </form>
{/snippet}

{#snippet modalFooter()}
  <div class="flex items-center justify-end gap-2">
    <button type="button" class="btn btn-secondary" onclick={closeModal}>
      Cancel
    </button>
    <button type="submit" form="tag-form" class="btn btn-primary">
      <Plus size={16} />
      {mode === "edit" ? "Save Changes" : "Create Tag"}
    </button>
  </div>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? "Edit Tag" : "New Tag"}
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
