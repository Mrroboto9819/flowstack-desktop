<script>
  import { Plus, Heading, FileText, Type, Hash, AlertCircle, Target, Tag, User, Activity, Layers3, Clock, CheckCircle2, Eye, ListTodo, Link2, X } from "$lib/icons";
  import Modal from "../Modal.svelte";
  import Switch from "../Switch.svelte";
  import Select from "../Select.svelte";
  import TagInput from "./TagInput.svelte";
  import SubtaskInput from "./SubtaskInput.svelte";
  import { taskStore, userStore, statusStore, sprintStore, settingsStore } from "../stores/index.js";
  import { marked } from "marked";

  // Get methodology from settings
  let methodology = $derived(settingsStore.settings.methodology || "agile");

  let {
    open = $bindable(false),
    mode = "create",
    task = null,
  } = $props();

  let formData = $state({
    id: "",
    title: "",
    description: "",
    tags: "",
    asign: "",
    time: "",
    status: "",
    type: "story",
    points: "",
    priority: "medium",
    epic: "",
    sprintId: "",
    blocked: false,
    blocker: "",
    acceptance: "",
    subtasks: [],
    relatedTasks: [],
  });

  let showPreview = $state("write"); // "write", "split", or "preview"
  let relatedTaskSearch = $state("");
  let showRelatedDropdown = $state(false);

  // Get data from stores
  let users = $derived(userStore.users);
  let statuses = $derived(statusStore.statuses);
  let sprints = $derived(sprintStore.sprints);
  let allTasks = $derived(taskStore.tasks);

  // Available tasks for related tasks selection (excluding current task)
  let availableTasks = $derived(
    allTasks.filter((t) => t.id !== formData.id).map((t) => ({ id: t.id, title: t.title }))
  );

  // Filtered tasks for related tasks dropdown
  let filteredRelatedTasks = $derived(
    availableTasks.filter(
      (t) =>
        !formData.relatedTasks.includes(t.id) &&
        t.title.toLowerCase().includes(relatedTaskSearch.toLowerCase())
    )
  );

  function addRelatedTask(taskId) {
    if (!formData.relatedTasks.includes(taskId)) {
      formData.relatedTasks = [...formData.relatedTasks, taskId];
    }
    relatedTaskSearch = "";
    showRelatedDropdown = false;
  }

  function removeRelatedTask(taskId) {
    formData.relatedTasks = formData.relatedTasks.filter((id) => id !== taskId);
  }

  function getTaskTitle(taskId) {
    const task = allTasks.find((t) => t.id === taskId);
    return task?.title || taskId;
  }

  // Initialize form when modal opens or task changes
  $effect(() => {
    if (open) {
      if (mode === "edit" && task) {
        formData = {
          id: task.id,
          title: task.title,
          description: task.description || "",
          tags: Array.isArray(task.tags) ? task.tags.join(", ") : "",
          asign: task.asign || "",
          time: task.time || "",
          status: task.status,
          type: task.type || "story",
          points: task.points ?? "",
          priority: task.priority || "medium",
          epic: task.epic || "",
          sprintId: task.sprintId || "",
          blocked: Boolean(task.blocked),
          blocker: task.blocker || "",
          acceptance: task.acceptance || "",
          subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
          relatedTasks: Array.isArray(task.relatedTasks) ? task.relatedTasks : [],
        };
      } else {
        // Get active sprint for new tasks
        const activeSprint = sprints.find((s) => s.status === "active");
        formData = {
          id: "",
          title: "",
          description: "",
          tags: "",
          asign: "",
          time: "",
          status: statuses[0]?.status || "BACKLOG",
          type: "story",
          points: "",
          priority: "medium",
          epic: "",
          sprintId: activeSprint?.id || "",
          blocked: false,
          blocker: "",
          acceptance: "",
          subtasks: [],
          relatedTasks: [],
        };
      }
      showPreview = "write"; // Reset preview mode
    }
  });

  function handleSubmit(e) {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert("Task title is required");
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      tags: formData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      asign: formData.asign.trim(),
      time: formData.time.trim(),
      status: formData.status,
      type: formData.type,
      points: String(formData.points || "").trim(),
      priority: formData.priority,
      epic: formData.epic.trim(),
      sprintId: formData.sprintId,
      blocked: Boolean(formData.blocked),
      blocker: formData.blocker.trim(),
      acceptance: formData.acceptance.trim(),
      subtasks: Array.isArray(formData.subtasks) ? formData.subtasks : [],
      relatedTasks: Array.isArray(formData.relatedTasks) ? formData.relatedTasks : [],
    };

    if (mode === "edit" && formData.id) {
      taskStore.update(formData.id, payload);
    } else {
      taskStore.create(payload);
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

  // Get assigned users
  let assignedUsers = $derived(
    users.map((user) => `${user.name} ${user.lastname}`.trim()).filter(Boolean)
  );

  // Select component options
  const typeOptions = [
    { value: "story", label: "Story" },
    { value: "bug", label: "Bug" },
    { value: "chore", label: "Chore" },
  ];

  const priorityOptions = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" },
  ];

  let assignOptions = $derived([
    { value: "", label: "Unassigned" },
    ...assignedUsers.map((user) => ({ value: user, label: user })),
  ]);

  let statusOptions = $derived(
    statuses.map((s) => ({ value: s.status, label: s.status }))
  );

  let sprintOptions = $derived([
    { value: "", label: "Backlog" },
    ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
  ]);
</script>

{#snippet modalChildren()}
  <form id="task-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Heading size={14} class="text-muted-foreground" />
        Title
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Ship drag and drop MVP"
        bind:value={formData.title}
        required
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <FileText size={14} class="text-muted-foreground" />
          Description (Markdown)
        </div>
        <div class="flex gap-1 rounded-lg bg-muted/30 p-1 border border-border">
          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium rounded transition-all ${
              showPreview === "write"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onclick={() => (showPreview = "write")}
            title="Editor only"
          >
            Write
          </button>
          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium rounded transition-all ${
              showPreview === "split"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onclick={() => (showPreview = "split")}
            title="Side by side"
          >
            Split
          </button>
          <button
            type="button"
            class={`px-3 py-1 text-xs font-medium rounded transition-all ${
              showPreview === "preview"
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onclick={() => (showPreview = "preview")}
            title="Preview only"
          >
            <Eye size={12} class="inline mr-1" />
            Preview
          </button>
        </div>
      </div>

      {#if showPreview === "write"}
        <textarea
          class="mt-2 min-h-[200px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono resize-y"
          placeholder="What needs to be done. Markdown is supported."
          bind:value={formData.description}
          onkeydown={handleTextareaKeydown}
        ></textarea>
      {:else if showPreview === "split"}
        <div class="mt-2 flex flex-col md:flex-row gap-3">
          <div class="flex-1">
            <textarea
              class="min-h-[200px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono resize-y"
              placeholder="What needs to be done. Markdown is supported."
              bind:value={formData.description}
              onkeydown={handleTextareaKeydown}
            ></textarea>
          </div>
          <div class="flex-1">
            <div class="min-h-[200px] w-full rounded-lg border border-border px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none overflow-y-auto bg-background">
              {#if formData.description}
                {@html marked(formData.description)}
              {:else}
                <span class="text-muted-foreground italic">No description to preview.</span>
              {/if}
            </div>
          </div>
        </div>
      {:else if showPreview === "preview"}
        <div class="mt-2 min-h-[200px] w-full rounded-lg border border-border px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none overflow-y-auto bg-background">
          {#if formData.description}
            {@html marked(formData.description)}
          {:else}
            <span class="text-muted-foreground italic">No description to preview.</span>
          {/if}
        </div>
      {/if}
    </label>

    <div class="grid gap-4 md:grid-cols-3">
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <Type size={14} class="text-muted-foreground" />
          Type
        </div>
        <div class="mt-2">
          <Select
            bind:value={formData.type}
            options={typeOptions}
            placeholder="Select type"
          />
        </div>
      </label>
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <Hash size={14} class="text-muted-foreground" />
          Points
        </div>
        <input
          class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="3"
          bind:value={formData.points}
        />
      </label>
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <AlertCircle size={14} class="text-muted-foreground" />
          Priority
        </div>
        <div class="mt-2">
          <Select
            bind:value={formData.priority}
            options={priorityOptions}
            placeholder="Select priority"
          />
        </div>
      </label>
    </div>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Target size={14} class="text-muted-foreground" />
        Epic
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Growth"
        bind:value={formData.epic}
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Tag size={14} class="text-muted-foreground" />
        Tags
      </div>
      <div class="mt-2">
        <TagInput bind:value={formData.tags} />
      </div>
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <User size={14} class="text-muted-foreground" />
        Assign
      </div>
      <div class="mt-2">
        <Select
          bind:value={formData.asign}
          options={assignOptions}
          placeholder="Unassigned"
        />
      </div>
    </label>

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

    {#if methodology === "agile"}
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <Layers3 size={14} class="text-muted-foreground" />
          Sprint
        </div>
        <div class="mt-2">
          <Select
            bind:value={formData.sprintId}
            options={sprintOptions}
            placeholder="Backlog"
          />
        </div>
      </label>
    {/if}

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Clock size={14} class="text-muted-foreground" />
        Time
      </div>
      <input
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="2h"
        bind:value={formData.time}
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <CheckCircle2 size={14} class="text-muted-foreground" />
        Acceptance criteria
      </div>
      <textarea
        class="mt-2 min-h-[90px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Given..., when..., then..."
        bind:value={formData.acceptance}
        onkeydown={handleTextareaKeydown}
      ></textarea>
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <ListTodo size={14} class="text-muted-foreground" />
        Subtasks
      </div>
      <div class="mt-2">
        <SubtaskInput bind:value={formData.subtasks} />
      </div>
    </label>

    <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Link2 size={14} class="text-muted-foreground" />
        Related Tasks
      </div>
      <div class="mt-2 space-y-2">
        <!-- Selected related tasks -->
        {#if formData.relatedTasks.length > 0}
          <div class="flex flex-wrap gap-2">
            {#each formData.relatedTasks as taskId (taskId)}
              <span class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground">
                <Link2 size={10} />
                <span class="max-w-[200px] truncate">{getTaskTitle(taskId)}</span>
                <button
                  type="button"
                  class="ml-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                  onclick={() => removeRelatedTask(taskId)}
                >
                  <X size={12} />
                </button>
              </span>
            {/each}
          </div>
        {/if}

        <!-- Search input -->
        <div class="relative">
          <input
            type="text"
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Search tasks to link..."
            bind:value={relatedTaskSearch}
            onfocus={() => (showRelatedDropdown = true)}
            onblur={() => setTimeout(() => (showRelatedDropdown = false), 200)}
          />

          <!-- Dropdown -->
          {#if showRelatedDropdown && (relatedTaskSearch || filteredRelatedTasks.length > 0)}
            <div class="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {#if filteredRelatedTasks.length === 0}
                <div class="px-3 py-2 text-sm text-muted-foreground">
                  {relatedTaskSearch ? "No matching tasks found" : "No more tasks available"}
                </div>
              {:else}
                {#each filteredRelatedTasks.slice(0, 10) as task (task.id)}
                  <button
                    type="button"
                    class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
                    onmousedown={() => addRelatedTask(task.id)}
                  >
                    <Link2 size={12} class="text-muted-foreground flex-shrink-0" />
                    <span class="truncate text-foreground">{task.title}</span>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <Switch bind:checked={formData.blocked} label="Status: Blocked" />

    {#if formData.blocked}
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Blocker reason
        <input
          class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Waiting on API access"
          bind:value={formData.blocker}
        />
      </label>
    {/if}
  </form>
{/snippet}

{#snippet modalFooter()}
  <div class="flex items-center justify-end gap-2">
    <button type="button" class="btn btn-secondary" onclick={closeModal}>
      Cancel
    </button>
    <button type="submit" form="task-form" class="btn btn-primary">
      <Plus size={16} />
      {mode === "edit" ? "Save Changes" : "Create Task"}
    </button>
  </div>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? "Edit Task" : "New Task"}
  size="xl"
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
