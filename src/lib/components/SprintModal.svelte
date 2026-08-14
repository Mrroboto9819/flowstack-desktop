<script>
  import { Plus, Heading, Target, Calendar, Activity, Eye, FileText } from "$lib/icons";
  import Modal from "../Modal.svelte";
  import Select from "../Select.svelte";
  import DatePicker from "./DatePicker.svelte";
  import { sprintStore } from "../stores/index.js";
  import { marked } from "marked";

  let {
    open = $bindable(false),
    mode = "create",
    sprint = null,
  } = $props();

  let formData = $state({
    id: "",
    name: "",
    goal: "",
    start: "",
    end: "",
    status: "planned",
  });

  let showPreview = $state("write");

  // Select component options
  const statusOptions = [
    { value: "planned", label: "Planned" },
    { value: "active", label: "Active" },
    { value: "closed", label: "Closed" },
  ];

  // Initialize form when modal opens or sprint changes
  $effect(() => {
    if (open) {
      if (mode === "edit" && sprint) {
        formData = {
          id: sprint.id,
          name: sprint.name,
          goal: sprint.goal || "",
          start: sprint.start || "",
          end: sprint.end || "",
          status: sprint.status || "planned",
        };
      } else {
        formData = {
          id: "",
          name: "",
          goal: "",
          start: "",
          end: "",
          status: "planned",
        };
      }
    }
  });

  function handleSubmit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Sprint name is required");
      return;
    }

    if (mode === "edit" && formData.id) {
      sprintStore.update(formData.id, {
        name: formData.name.trim(),
        goal: formData.goal.trim(),
        start: formData.start,
        end: formData.end,
        status: formData.status,
      });
    } else {
      sprintStore.create({
        name: formData.name.trim(),
        goal: formData.goal.trim(),
        start: formData.start,
        end: formData.end,
        status: formData.status,
      });
    }

    closeModal();
  }

  function closeModal() {
    open = false;
  }

  // Handle Tab key in textareas - inserts tab instead of moving focus
  function handleTextareaKeydown(e) {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Insert tab character at cursor position
      textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);

      // Move cursor after the inserted tab
      textarea.selectionStart = textarea.selectionEnd = start + 1;

      // Trigger input event to update bound value
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
</script>

{#snippet modalChildren()}
  <form id="sprint-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Heading size={14} class="text-muted-foreground" />
        Sprint name
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Sprint 12"
        bind:value={formData.name}
        required
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <Target size={14} class="text-muted-foreground" />
          Goal (Markdown)
        </div>
        <div class="flex gap-1">
          <button
            type="button"
            class={`px-2 py-1 rounded text-xs transition-colors ${
              showPreview === "write"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onclick={() => (showPreview = "write")}
          >
            <FileText size={12} class="inline mr-1" />
            Write
          </button>
          <button
            type="button"
            class={`px-2 py-1 rounded text-xs transition-colors ${
              showPreview === "preview"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onclick={() => (showPreview = "preview")}
          >
            <Eye size={12} class="inline mr-1" />
            Preview
          </button>
        </div>
      </div>

      {#if showPreview === "write"}
        <textarea
          class="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="## Sprint Goal&#10;&#10;Ship onboarding flow with:&#10;- User registration&#10;- Email verification&#10;- Profile setup"
          bind:value={formData.goal}
          onkeydown={handleTextareaKeydown}
        ></textarea>
      {:else}
        <div
          class="mt-2 min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground prose prose-sm dark:prose-invert max-w-none overflow-auto"
        >
          {#if formData.goal.trim()}
            {@html marked(formData.goal)}
          {:else}
            <p class="text-muted-foreground italic">No goal specified. Switch to Write mode to add content.</p>
          {/if}
        </div>
      {/if}
      <p class="mt-1 text-xs text-muted-foreground">
        Supports markdown: **bold**, *italic*, `code`, lists, and more
      </p>
    </label>

    <div class="grid gap-4 md:grid-cols-2">
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <Calendar size={14} class="text-muted-foreground" />
          Start date
        </div>
        <div class="mt-2">
          <DatePicker
            bind:value={formData.start}
            placeholder="Select start date"
          />
        </div>
      </label>

      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <Calendar size={14} class="text-muted-foreground" />
          End date
        </div>
        <div class="mt-2">
          <DatePicker
            bind:value={formData.end}
            placeholder="Select end date"
          />
        </div>
      </label>
    </div>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Activity size={14} class="text-muted-foreground" />
        Status
      </div>
      <div class="mt-2">
        <Select
          bind:value={formData.status}
          options={statusOptions}
          placeholder="Select status"
        />
      </div>
    </label>
  </form>
{/snippet}

{#snippet modalFooter()}
  <div class="flex items-center justify-end gap-2">
    <button type="button" class="btn btn-secondary" onclick={closeModal}>
      Cancel
    </button>
    <button type="submit" form="sprint-form" class="btn btn-primary">
      <Plus size={16} />
      {mode === "edit" ? "Save Changes" : "Create Sprint"}
    </button>
  </div>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? "Edit Sprint" : "New Sprint"}
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
