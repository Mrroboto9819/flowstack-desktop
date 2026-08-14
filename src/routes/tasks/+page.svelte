<script>
  import { onMount } from "svelte";
  import {
    Plus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    GripVertical,
    Move,
    CheckCircle,
    Clipboard,
    Tag,
    Clock,
    Hash,
    AlertCircle,
    AlertTriangle,
    Eye,
    ListTodo,
    Download,
    Upload,
    ChevronDown,
    SlidersHorizontal,
  } from "$lib/icons";
  import { taskStore, userStore, statusStore, settingsStore, sprintStore, projectStore } from "../../lib/stores/index.js";
  import TaskModal from "../../lib/components/TaskModal.svelte";
  import TaskDetailModal from "../../lib/components/TaskDetailModal.svelte";
  import ConfirmModal from "../../lib/components/ConfirmModal.svelte";
  import TaskTimer from "../../lib/components/TaskTimer.svelte";
  import ToolsMenu from "../../lib/components/ToolsMenu.svelte";
  import Skeleton from "../../lib/components/Skeleton.svelte";
  import { appState } from "../../lib/stores/app.svelte.js";
  import Select from "../../lib/Select.svelte";
  import DatePicker from "../../lib/components/DatePicker.svelte";
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { marked } from "marked";
  import { toastStore } from "../../lib/toastStore.svelte.js";
  import { _ } from "$lib/i18n";
  import { formatBoardSummaryForClipboard, copyToClipboard } from "../../lib/utils/clipboard.js";
  import { exportTasksToFile, importTasksWithDialog } from "../../lib/utils/taskTransfer.js";
  import { staggerChildren } from "$lib/actions/animate.js";

  let allTasks = $derived(taskStore.tasks.filter((t) => projectStore.inScope(t)));
  let users = $derived(userStore.users);
  let visibleStatuses = $derived(statusStore.visible);
  let settings = $derived(settingsStore.settings);
  let methodology = $derived(settingsStore.settings.methodology || "agile");

  // Status filter options for Select component
  let statusFilterOptions = $derived([
    { value: "all", label: $_("common.all") },
    ...visibleStatuses.map((s) => ({ value: s.status, label: s.status })),
  ]);

  // Sprint filter options for Select component
  let sprints = $derived(sprintStore.sprints.filter((s) => projectStore.inScope(s)));
  let sprintFilterOptions = $derived([
    { value: "all", label: $_("common.all") },
    { value: "backlog", label: $_("tasks.backlog") },
    ...sprints.map((s) => ({ value: s.id, label: s.name || `Sprint ${s.id.slice(0, 4)}` })),
  ]);

  const flipDurationMs = 200;

  // Modal state
  let taskModalOpen = $state(false);
  let taskModalMode = $state("create");
  let selectedTask = $state(null);

  // Detail modal state
  let detailModalOpen = $state(false);
  let detailTask = $state(null);

  // Confirm modal state
  let confirmModalOpen = $state(false);
  let taskToDelete = $state(null);

  // Filter state
  let filterStatus = $state("all");
  let filterSprint = $state("all");
  let filterTag = $state("");
  let filterFrom = $state("");
  let filterTo = $state("");

  // DnD state - temporary items during drag
  let taskDndItems = $state({});

  // Format date helper
  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Priority colors
  const priorityColors = {
    critical: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-500" },
    high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
    medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-500" },
    low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  };

  function getPriorityColor(priority) {
    return priorityColors[priority] || priorityColors.medium;
  }

  // Filter functions
  function matchesStatus(task) {
    return filterStatus === "all" ? true : task.status === filterStatus;
  }

  function matchesSprint(task) {
    if (filterSprint === "all") return true;
    if (filterSprint === "backlog") return !task.sprintId;
    return task.sprintId === filterSprint;
  }

  function matchesTag(task) {
    if (!filterTag.trim()) return true;
    const needle = filterTag.trim().toLowerCase();
    return (task.tags || []).some((tag) => tag.toLowerCase().includes(needle));
  }

  function matchesDate(task) {
    if (!filterFrom && !filterTo) return true;
    const created = new Date(task.created || task.updated || Date.now()).getTime();
    if (Number.isNaN(created)) return true;
    if (filterFrom) {
      const fromDate = new Date(`${filterFrom}T00:00:00`).getTime();
      if (created < fromDate) return false;
    }
    if (filterTo) {
      const toDate = new Date(`${filterTo}T23:59:59`).getTime();
      if (created > toDate) return false;
    }
    return true;
  }

  // Get filtered tasks
  let filteredTasks = $derived(
    allTasks.filter((task) => matchesStatus(task) && matchesSprint(task) && matchesTag(task) && matchesDate(task))
  );

  // Get tasks for status
  function getTasksForStatus(status) {
    return filteredTasks.filter((task) => task.status === status);
  }

  // Get tasks for status with DnD support
  function getTasksForStatusDnd(status) {
    return taskDndItems[status] || getTasksForStatus(status);
  }

  // Task modal functions
  function openTaskModal() {
    taskDndItems = {}; // Clear DnD state
    taskModalMode = "create";
    selectedTask = null;
    taskModalOpen = true;
  }

  function editTask(task) {
    taskDndItems = {}; // Clear DnD state
    taskModalMode = "edit";
    selectedTask = task;
    taskModalOpen = true;
  }

  function viewTaskDetail(task) {
    taskDndItems = {}; // Clear DnD state
    detailTask = task;
    detailModalOpen = true;
  }

  function removeTask(task) {
    taskDndItems = {}; // Clear DnD state
    taskToDelete = task;
    confirmModalOpen = true;
  }

  function confirmDelete() {
    if (taskToDelete) {
      taskStore.delete(taskToDelete.id);
      taskToDelete = null;
    }
  }

  // Clear filters
  function clearFilters() {
    filterStatus = "all";
    filterSprint = "all";
    filterTag = "";
    filterFrom = "";
    filterTo = "";
    toastStore.info($_("tasks.filtersCleared"));
  }

  // Copy summary
  async function copyTagsSummary() {
    const sprints = sprintStore.sprints;
    const text = formatBoardSummaryForClipboard(filteredTasks, visibleStatuses, { sprints });
    const success = await copyToClipboard(text);
    if (success) {
      toastStore.success($_("tasks.summaryCopied"));
    }
  }

  // Export the current filter selection, so "export" matches what is on screen
  async function exportTasks() {
    await exportTasksToFile(filteredTasks);
  }

  async function importTasks() {
    await importTasksWithDialog();
  }

  let toolItems = $derived([
    {
      label: $_("tasks.copySummary"),
      description: $_("tasks.copySummaryHint"),
      icon: Clipboard,
      onSelect: copyTagsSummary,
    },
    {
      label: $_("tasks.exportTasks"),
      description: $_("tasks.exportTasksHint"),
      icon: Download,
      onSelect: exportTasks,
      separatorBefore: true,
    },
    {
      label: $_("tasks.importTasks"),
      description: $_("tasks.importTasksHint"),
      icon: Upload,
      onSelect: importTasks,
    },
  ]);

  // Filters start collapsed so the board owns the screen; the badge keeps any
  // active filter visible while hidden
  let filtersOpen = $state(false);

  let activeFilterCount = $derived(
    [
      filterStatus !== "all",
      filterSprint !== "all",
      filterTag.trim() !== "",
      filterFrom !== "",
      filterTo !== "",
    ].filter(Boolean).length,
  );

  // Which task cards have their subtask list expanded, keyed by task id
  let expandedSubtasks = $state({});

  function toggleSubtaskPanel(taskId) {
    expandedSubtasks = { ...expandedSubtasks, [taskId]: !expandedSubtasks[taskId] };
  }

  // Drag and drop handlers
  function handleTaskDndConsider(status, e) {
    const { items: newItems } = e.detail;
    taskDndItems = { ...taskDndItems, [status]: newItems };
  }

  function handleTaskDndFinalize(status, e) {
    const { items: newItems } = e.detail;
    const cleanItems = newItems.filter((item) => !item.isDndShadowItem);

    // Update each task with new status
    cleanItems.forEach((item) => {
      if (item.status !== status) {
        taskStore.updateStatus(item.id, status);
      }
    });

    // Clear temporary DnD state
    taskDndItems = {};
  }

  onMount(() => {
    // Component mounted
  });
</script>

<!-- Fixed-height board.
     The app shell scrolls vertically, which used to push the board's horizontal
     scrollbar below the fold - you had to scroll DOWN to then scroll SIDEWAYS.
     Here the page never scrolls: the header and filters are fixed, the board
     fills the remaining height, and scrolling happens inside it. 40px is the
     custom titlebar. -->
<main
  class="flex flex-col overflow-hidden px-4 pt-6 sm:px-6"
  style="height: calc(100vh - 40px);"
>
  <!-- Page header: title, counts and primary actions, separated by a rule
       rather than wrapped in a card -->
  <header class="mb-5 shrink-0 border-b border-border pb-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("tasks.title")}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{$_("tasks.description")}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ToolsMenu label={$_("tasks.tools")} items={toolItems} />
        <button
          type="button"
          class="btn btn-primary"
          onclick={openTaskModal}
        >
          <Plus size={16} />
          {$_("tasks.newTask")}
        </button>
      </div>
    </div>

    <!-- Counts read as a line of text instead of three boxes -->
    <dl class="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
      <div class="flex items-baseline gap-1.5">
        <dd class="font-semibold text-foreground">{allTasks.length}</dd>
        <dt class="text-muted-foreground">{$_("tasks.totalTasks")}</dt>
      </div>
      <div class="flex items-baseline gap-1.5">
        <dd class="font-semibold text-foreground">{filteredTasks.length}</dd>
        <dt class="text-muted-foreground">{$_("tasks.filteredTasks")}</dt>
      </div>
      <div class="flex items-baseline gap-1.5">
        <dd class="font-semibold text-foreground">{users.length}</dd>
        <dt class="text-muted-foreground">{$_("tasks.totalUsers")}</dt>
      </div>
    </dl>
  </header>

  <!-- Filters collapse so the board gets the whole surface -->
  <section class="mb-4 shrink-0" aria-label={$_("tasks.filtersStats")}>
    <button
      type="button"
      class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      onclick={() => (filtersOpen = !filtersOpen)}
      aria-expanded={filtersOpen}
    >
      <SlidersHorizontal size={13} />
      {$_("tasks.filtersStats")}
      {#if activeFilterCount > 0}
        <span class="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          {activeFilterCount}
        </span>
      {/if}
      <ChevronDown
        size={14}
        class="transition-transform duration-200 {filtersOpen ? 'rotate-180' : ''}"
      />
    </button>

    {#if filtersOpen}
      <div class="grid gap-3 sm:grid-cols-2 {methodology === 'agile' ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}">
        <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {$_("tasks.filterStatus")}
          <div class="mt-2">
            <Select
              bind:value={filterStatus}
              options={statusFilterOptions}
              placeholder={$_("tasks.selectStatus")}
            />
          </div>
        </label>
        {#if methodology === "agile"}
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {$_("tasks.filterSprint")}
            <div class="mt-2">
              <Select
                bind:value={filterSprint}
                options={sprintFilterOptions}
                placeholder={$_("tasks.selectSprint")}
              />
            </div>
          </label>
        {/if}
        <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {$_("tasks.filterTag")}
          <input
            class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="design"
            bind:value={filterTag}
          />
        </label>
        <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {$_("tasks.filterFrom")}
          <div class="mt-2">
            <DatePicker
              bind:value={filterFrom}
              placeholder={$_("tasks.startDate")}
            />
          </div>
        </label>
        <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {$_("tasks.filterTo")}
          <div class="mt-2">
            <DatePicker
              bind:value={filterTo}
              placeholder={$_("tasks.endDate")}
            />
          </div>
        </label>

        <!-- Sits in the grid so it lines up with the inputs on every breakpoint -->
        <div class="flex items-end">
          <button
            type="button"
            class="btn btn-secondary w-full"
            onclick={clearFilters}
          >
            {$_("tasks.clearFilters")}
          </button>
        </div>
      </div>
    {/if}
  </section>

  <!-- No results warning -->
  {#if allTasks.length > 0 && filteredTasks.length === 0}
    <p class="mb-3 shrink-0 border-l-2 border-primary py-2 pl-4 text-sm text-primary">
      {$_("tasks.noMatchFilters")}
    </p>
  {/if}

  <!-- Kanban Board: fills the remaining height. The horizontal scrollbar sits
       at the bottom of the visible board, so it is always reachable without
       scrolling the page first. min-h-0 is required for flex-1 to be allowed
       to shrink below its content height. -->
  <div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-3">
    <div class="flex h-full gap-4" use:staggerChildren={{ y: 16, stagger: 0.06 }}>
      {#each visibleStatuses as statusItem (statusItem.id)}
        <!-- Columns share the width when they fit, and only start scrolling
             sideways once they cannot - so all sections stay visible. -->
        <div
          class="flex h-full min-w-[264px] flex-1 flex-col"
          role="list"
        >
          <!-- Column header stays put while the column's tasks scroll under it -->
          <div class="mb-3 flex shrink-0 items-center gap-2 border-b border-border pb-2.5">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              style={`background-color: ${statusItem.color}`}
            ></span>
            <h3 class="truncate text-xs font-semibold uppercase tracking-wider text-foreground">
              {statusItem.status}
            </h3>
            <span class="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">
              {getTasksForStatus(statusItem.status).length}
            </span>
          </div>

          <!-- Each column scrolls its own tasks, so a long column never pushes
               the board or the other columns out of view -->
          {#if !appState.ready}
            <!-- Card-shaped placeholders so the board does not reflow when the
                 real tasks arrive -->
            <div class="flex flex-col gap-3">
              {#each Array(3) as _, i}
                <div class="rounded-xl border border-border bg-card p-4">
                  <Skeleton variant="title" width="{85 - i * 15}%" />
                  <div class="mt-3 flex gap-1.5">
                    <Skeleton variant="chip" />
                    <Skeleton variant="chip" class="w-9" />
                  </div>
                  <div class="mt-3"><Skeleton width="60%" /></div>
                </div>
              {/each}
            </div>
          {:else}
          <div
            class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
            use:dndzone={{
              items: getTasksForStatusDnd(statusItem.status),
              flipDurationMs,
              type: "task",
            }}
            onconsider={(e) => handleTaskDndConsider(statusItem.status, e)}
            onfinalize={(e) => handleTaskDndFinalize(statusItem.status, e)}
          >
                {#each getTasksForStatusDnd(statusItem.status) as task (task.id)}
                  {@const priorityColor = getPriorityColor(task.priority || "medium")}
                  {@const subtasksAllDone =
                    Array.isArray(task.subtasks) &&
                    task.subtasks.length > 0 &&
                    task.subtasks.every((st) => st.completed)}
                  <article
                    animate:flip={{ duration: flipDurationMs }}
                    class={`group relative flex cursor-grab flex-col rounded-xl border bg-card p-4 transition-colors duration-200 active:scale-[0.99] ${
                      task.blocked
                        ? "border-rose-500/40 bg-rose-500/5"
                        : subtasksAllDone
                          ? "task-card--complete border-emerald-500/50 bg-emerald-500/5"
                          : "border-border hover:border-primary"
                    }`}
                  >
                    <!-- Drag handle -->
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-40 transition-opacity duration-200">
                      <GripVertical size={16} class="text-muted-foreground" />
                    </div>

                    <!-- Title with click to view details -->
                    <button
                      type="button"
                      class="text-left w-full mb-3"
                      onclick={() => viewTaskDetail(task)}
                    >
                      <h4 class="text-base font-bold text-foreground leading-tight break-words pr-6">
                        {task.title}
                      </h4>
                    </button>

                    <!-- Badges: Priority, Points, Time, Blocked -->
                    <div class="flex flex-wrap items-center gap-2 mb-3">
                      <span class={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor.bg} ${priorityColor.border} ${priorityColor.text}`}>
                        <AlertCircle size={10} />
                        {$_(`tasks.priority.${task.priority || "medium"}`)}
                      </span>

                      {#if task.points}
                        <span class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Hash size={10} />
                          {task.points}
                        </span>
                      {/if}

                      {#if task.time}
                        <span class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          <Clock size={10} />
                          {task.time}
                        </span>
                      {/if}

                      {#if task.blocked}
                        <span class="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                          <AlertTriangle size={10} />
                          {$_("tasks.blocked")}
                        </span>
                      {/if}
                    </div>

                    <!-- Description (markdown preview, truncated) -->
                    {#if task.description}
                      <button
                        type="button"
                        class="mb-3 text-xs text-muted-foreground text-left w-full prose prose-xs dark:prose-invert max-w-none overflow-hidden relative"
                        style="max-height: 3.6em; -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%); mask-image: linear-gradient(to bottom, black 50%, transparent 100%);"
                        onclick={() => viewTaskDetail(task)}
                      >
                        {@html marked(task.description)}
                      </button>
                    {/if}

                    <!-- Tags -->
                    {#if task.tags && task.tags.length > 0}
                      <div class="flex flex-wrap gap-1.5 mb-3">
                        {#each task.tags.slice(0, 3) as tag}
                          <span class="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[9px] font-medium text-foreground">
                            <Tag size={8} />
                            {tag}
                          </span>
                        {/each}
                        {#if task.tags.length > 3}
                          <span class="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                            +{task.tags.length - 3}
                          </span>
                        {/if}
                      </div>
                    {/if}

                    <!-- Subtasks: progress summary that expands into a tickable list -->
                    {#if task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0}
                      {@const completedSubtasks = task.subtasks.filter(st => st.completed).length}
                      {@const totalSubtasks = task.subtasks.length}
                      {@const expanded = expandedSubtasks[task.id] === true}
                      <div class="mb-3">
                        <button
                          type="button"
                          class="mb-1 flex w-full items-center gap-2 text-left"
                          onclick={() => toggleSubtaskPanel(task.id)}
                          aria-expanded={expanded}
                        >
                          <ListTodo size={10} class="shrink-0 text-muted-foreground" />
                          <span class="text-[10px] font-medium text-muted-foreground">
                            {completedSubtasks}/{totalSubtasks} {$_("tasks.subtasks")}
                          </span>
                          <ChevronDown
                            size={12}
                            class="ml-auto shrink-0 text-muted-foreground transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
                          />
                        </button>
                        <div class="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            class="h-full bg-primary transition-all duration-300"
                            style={`width: ${totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0}%`}
                          ></div>
                        </div>

                        {#if expanded}
                          <ul class="mt-2 flex flex-col gap-1.5">
                            {#each task.subtasks as subtask (subtask.id)}
                              <li>
                                <button
                                  type="button"
                                  class="flex w-full items-start gap-2 text-left"
                                  onclick={() => taskStore.toggleSubtask(task.id, subtask.id)}
                                >
                                  <span
                                    class={`mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                      subtask.completed
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border hover:border-primary"
                                    }`}
                                  >
                                    {#if subtask.completed}
                                      <CheckCircle size={10} />
                                    {/if}
                                  </span>
                                  <span
                                    class={`text-[11px] leading-snug ${
                                      subtask.completed
                                        ? "text-muted-foreground"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {subtask.text}
                                  </span>
                                </button>
                              </li>
                            {/each}
                          </ul>
                        {/if}
                      </div>
                    {/if}

                    <!-- Timer -->
                    <div class="mb-3">
                      <TaskTimer
                        taskId={task.id}
                        elapsedSeconds={task.elapsedSeconds || 0}
                        timerStartedAt={task.timerStartedAt || null}
                        isRunning={task.timerRunning || false}
                        onStart={(id) => taskStore.startTimer(id)}
                        onPause={(id) => taskStore.pauseTimer(id)}
                        onReset={(id) => taskStore.resetTimer(id)}
                        compact={true}
                      />
                    </div>

                    <!-- Divider -->
                    <div class="my-3 border-t border-border"></div>

                    <!-- Footer -->
                    <div class="flex items-center justify-between gap-2">
                      <!-- Left: Assigned user -->
                      <div class="flex items-center gap-2 min-w-0">
                        {#if task.asign}
                          <div
                            class="h-6 w-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary uppercase flex-shrink-0"
                            title={task.asign}
                          >
                            {task.asign[0]}
                          </div>
                          <span class="text-[10px] text-muted-foreground truncate">
                            {task.asign}
                          </span>
                        {:else}
                          <span class="text-[10px] text-muted-foreground italic">
                            {$_("tasks.unassigned")}
                          </span>
                        {/if}
                      </div>

                      <!-- Right: Action Buttons -->
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          class="btn btn-ghost px-2 py-1 text-[10px]"
                          onclick={(e) => {
                            e.stopPropagation();
                            viewTaskDetail(task);
                          }}
                          title={$_("tasks.viewDetails")}
                        >
                          <Eye size={12} />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost px-2 py-1 text-[10px]"
                          onclick={(e) => {
                            e.stopPropagation();
                            editTask(task);
                          }}
                          title={$_("common.edit")}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-500 hover:text-white"
                          onclick={(e) => {
                            e.stopPropagation();
                            removeTask(task);
                          }}
                          title={$_("common.delete")}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </article>
          {:else}
            <!-- Empty column: a quiet drop target rather than a heavy dashed box -->
            <div class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 transition-colors duration-200 hover:border-primary hover:bg-primary/5">
              <span class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Move size={13} class="opacity-50" />
                {$_("tasks.dropTasksHere")}
              </span>
            </div>
          {/each}
          </div>
          {/if}
        </div>
    {/each}
  </div>
</main>

<!-- Task Modal -->
<TaskModal
  bind:open={taskModalOpen}
  mode={taskModalMode}
  task={selectedTask}
/>

<!-- Task Detail Modal -->
<TaskDetailModal
  bind:open={detailModalOpen}
  task={detailTask}
  onEdit={editTask}
  onDelete={removeTask}
/>

<!-- Confirm Delete Modal -->
<ConfirmModal
  bind:open={confirmModalOpen}
  title={$_("tasks.deleteTask")}
  message={taskToDelete ? $_("tasks.deleteTaskMessage", { values: { title: taskToDelete.title } }) : $_("confirmModal.defaultMessage")}
  confirmText={$_("common.delete")}
  cancelText={$_("common.cancel")}
  variant="danger"
  onConfirm={confirmDelete}
/>
