<script>
  import {
    Plus,
    Pencil,
    Trash2,
    Play,
    CheckCircle,
    Calendar,
    Target,
    TrendingUp,
    Clock,
    Move,
    Eye,
    ChevronDown,
    AlertTriangle,
  } from "$lib/icons";
  import {
    sprintStore,
    taskStore,
    statusStore,
    settingsStore,
  } from "../../lib/stores/index.js";
  import SprintModal from "../../lib/components/SprintModal.svelte";
  import ConfirmModal from "../../lib/components/ConfirmModal.svelte";
  import TaskModal from "../../lib/components/TaskModal.svelte";
  import TaskDetailModal from "../../lib/components/TaskDetailModal.svelte";
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { toastStore } from "../../lib/toastStore.svelte.js";
  import { marked } from "marked";
  import { _ } from "$lib/i18n";

  let sprints = $derived(sprintStore.sprints);
  let allTasks = $derived(taskStore.tasks);
  let visibleStatuses = $derived(statusStore.visible);

  // Board state for the active sprint
  const flipDurationMs = 200;
  let taskDndItems = $state({});
  let boardOpen = $state(true);

  // Task modal state - on the old /sprint page these were console.log stubs,
  // so you could not create or edit a task from the board at all
  let taskModalOpen = $state(false);
  let taskModalMode = $state("create");
  let selectedTask = $state(null);
  let detailModalOpen = $state(false);
  let detailTask = $state(null);
  let taskToDelete = $state(null);

  // Modal state
  let sprintModalOpen = $state(false);
  let sprintModalMode = $state("create");
  let selectedSprint = $state(null);

  // Confirm modal state
  let confirmModalOpen = $state(false);
  let confirmModalType = $state("delete"); // "delete" or "complete"
  let sprintToDelete = $state(null);
  let sprintToComplete = $state(null);

  // Group sprints by status
  let plannedSprints = $derived(sprints.filter((s) => s.status === "planned"));
  let activeSprints = $derived(sprints.filter((s) => s.status === "active"));
  let closedSprints = $derived(sprints.filter((s) => s.status === "closed"));

  // Sprint modal functions
  function openSprintModal() {
    sprintModalMode = "create";
    selectedSprint = null;
    sprintModalOpen = true;
  }

  function editSprint(sprint) {
    sprintModalMode = "edit";
    selectedSprint = sprint;
    sprintModalOpen = true;
  }

  function confirmDeleteSprint(sprint) {
    confirmModalType = "delete";
    sprintToDelete = sprint;
    sprintToComplete = null;
    confirmModalOpen = true;
  }

  function confirmCompleteSprint(sprint) {
    confirmModalType = "complete";
    sprintToComplete = sprint;
    sprintToDelete = null;
    confirmModalOpen = true;
  }

  function handleConfirm() {
    if (confirmModalType === "delete" && sprintToDelete) {
      sprintStore.delete(sprintToDelete.id);
      sprintToDelete = null;
    } else if (confirmModalType === "complete" && sprintToComplete) {
      sprintStore.complete(sprintToComplete.id);
      sprintToComplete = null;
    } else if (confirmModalType === "task" && taskToDelete) {
      taskStore.delete(taskToDelete.id);
      taskToDelete = null;
    }
  }

  // --- Active sprint board -------------------------------------------------

  let activeSprint = $derived(sprints.find((s) => s.status === "active"));

  function getActiveSprintTasks() {
    if (!activeSprint) return [];
    return allTasks.filter((t) => t.sprintId === activeSprint.id);
  }

  function getBoardTasks(status) {
    return getActiveSprintTasks().filter((t) => t.status === status);
  }

  function getBoardTasksDnd(status) {
    return taskDndItems[status] || getBoardTasks(status);
  }

  function handleTaskDndConsider(status, e) {
    taskDndItems = { ...taskDndItems, [status]: e.detail.items };
  }

  function handleTaskDndFinalize(status, e) {
    const clean = e.detail.items.filter((item) => !item.isDndShadowItem);
    clean.forEach((item) => {
      if (item.status !== status) taskStore.updateStatus(item.id, status);
    });
    taskDndItems = {};
  }

  // Real implementations - the old /sprint page only logged to the console
  function openTaskModal() {
    taskDndItems = {};
    taskModalMode = "create";
    selectedTask = activeSprint ? { sprintId: activeSprint.id } : null;
    taskModalOpen = true;
  }

  function editTask(task) {
    taskDndItems = {};
    taskModalMode = "edit";
    selectedTask = task;
    taskModalOpen = true;
  }

  function viewTaskDetail(task) {
    taskDndItems = {};
    detailTask = task;
    detailModalOpen = true;
  }

  function removeTask(task) {
    taskDndItems = {};
    confirmModalType = "task";
    taskToDelete = task;
    sprintToDelete = null;
    sprintToComplete = null;
    confirmModalOpen = true;
  }

  const priorityColors = {
    critical: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-500" },
    high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
    medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-500" },
    low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  };

  function getPriorityColor(priority) {
    return priorityColors[priority] || priorityColors.medium;
  }

  function activateSprint(sprintId) {
    sprintStore.activate(sprintId);
  }

  // Get tasks for sprint
  function getSprintTasks(sprintId) {
    return allTasks.filter((t) => t.sprintId === sprintId);
  }

  function getTotalPoints(tasks) {
    return tasks.reduce((sum, task) => {
      const points = parseInt(task.points) || 0;
      return sum + points;
    }, 0);
  }

  function getCompletedTasks(tasks) {
    return tasks.filter((t) => t.status === "DONE" || t.status === "COMPLETE");
  }

  function formatDate(dateString) {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getDaysRemaining(endDate) {
    if (!endDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0); // Reset to start of day
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff;
  }

  // Status badge colors
  const statusColors = {
    planned: {
      bg: "bg-primary/10",
      border: "border-primary/30",
      text: "text-primary",
    },
    active: {
      bg: "bg-primary/10",
      border: "border-primary/30",
      text: "text-primary",
    },
    closed: {
      bg: "bg-muted",
      border: "border-border",
      text: "text-muted-foreground",
    },
  };

  function getStatusColor(status) {
    return statusColors[status] || statusColors.planned;
  }
</script>

<main class="min-h-screen px-4 pt-6 pb-10 sm:px-6">
  <!-- Header -->
  <header class="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("sprints.title")}</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {$_("sprints.description")}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if activeSprint}
        <button type="button" class="btn btn-secondary" onclick={openTaskModal}>
          <Plus size={16} />
          {$_("tasks.newTask")}
        </button>
      {/if}
      <button type="button" class="btn btn-primary" onclick={openSprintModal}>
        <Plus size={16} />
        {$_("sprints.newSprint")}
      </button>
    </div>
  </header>

  <div class="space-y-8">
    <!-- Active Sprints -->
    {#if activeSprints.length > 0}
      <section>
        <h2
          class="text-xl font-bold text-foreground mb-4 flex items-center gap-2"
        >
          <Play size={20} class="text-primary" />
          {$_("sprints.activeSprint")}
        </h2>
        <div class="grid gap-4">
          {#each activeSprints as sprint (sprint.id)}
            {@const sprintTasks = getSprintTasks(sprint.id)}
            {@const completedTasks = getCompletedTasks(sprintTasks)}
            {@const totalPoints = getTotalPoints(sprintTasks)}
            {@const completedPoints = getTotalPoints(completedTasks)}
            {@const daysRemaining = getDaysRemaining(sprint.end)}
            {@const statusColor = getStatusColor(sprint.status)}

            <!-- Active sprint: a left accent rule marks it as current, instead
                 of a filled card wrapping more cards -->
            <article class="border-l-2 border-primary pl-4 sm:pl-5">
              <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-bold text-foreground sm:text-xl">
                      {sprint.name}
                    </h3>
                    <span
                      class={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor.bg} ${statusColor.border} ${statusColor.text}`}
                    >
                      {sprint.status}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-secondary px-3 py-2 text-sm"
                    onclick={() => editSprint(sprint)}
                  >
                    <Pencil size={14} />
                    {$_("common.edit")}
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary px-3 py-2 text-sm"
                    onclick={() => confirmCompleteSprint(sprint)}
                  >
                    <CheckCircle size={14} />
                    {$_("sprints.complete")}
                  </button>
                </div>
              </div>

              <!-- Sprint Goal -->
              {#if sprint.goal}
                <div class="mb-4 space-y-1.5">
                  <h4 class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Target size={12} />
                    {$_("sprints.sprintGoal")}
                  </h4>
                  <div class="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                    {@html marked(sprint.goal)}
                  </div>
                </div>
              {/if}

              <!-- Sprint stats as a line of figures, not four boxes -->
              <dl class="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                <div>
                  <dt class="text-xs uppercase tracking-wide text-muted-foreground">
                    {$_("sprints.tasks")}
                  </dt>
                  <dd class="mt-1 text-xl font-bold text-foreground">
                    {completedTasks.length}/{sprintTasks.length}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-muted-foreground">
                    {$_("sprints.points")}
                  </dt>
                  <dd class="mt-1 text-xl font-bold text-foreground">
                    {completedPoints}/{totalPoints}
                  </dd>
                </div>
                <div>
                  <dt class="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <Calendar size={12} />
                    {$_("sprints.startDate")}
                  </dt>
                  <dd class="mt-1 text-sm font-semibold text-foreground">
                    {formatDate(sprint.start)}
                  </dd>
                </div>
                <div>
                  <dt class="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    <Clock size={12} />
                    {$_("sprints.daysLeft")}
                  </dt>
                  <dd
                    class="mt-1 text-xl font-bold {daysRemaining !== null &&
                    daysRemaining < 3
                      ? 'text-rose-500'
                      : 'text-foreground'}"
                  >
                    {daysRemaining !== null ? daysRemaining : "—"}
                  </dd>
                </div>
              </dl>

              <!-- Progress Bar -->
              {#if sprintTasks.length > 0}
                <div class="mt-4">
                  <div
                    class="flex items-center justify-between text-xs text-muted-foreground mb-2"
                  >
                    <span>{$_("sprints.progress")}</span>
                    <span
                      >{Math.round(
                        (completedTasks.length / sprintTasks.length) * 100,
                      )}%</span
                    >
                  </div>
                  <div class="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      class="h-full bg-primary transition-all duration-300"
                      style={`width: ${(completedTasks.length / sprintTasks.length) * 100}%`}
                    ></div>
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Active sprint board - this is what used to live on its own /sprint page -->
    {#if activeSprint}
      <section aria-label={$_("sprint.title")}>
        <button
          type="button"
          class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          onclick={() => (boardOpen = !boardOpen)}
          aria-expanded={boardOpen}
        >
          {$_("sprint.title")}
          <span class="text-muted-foreground/60">{getActiveSprintTasks().length}</span>
          <ChevronDown
            size={14}
            class="transition-transform duration-200 {boardOpen ? 'rotate-180' : ''}"
          />
        </button>

        {#if boardOpen}
          <div class="overflow-x-auto pb-3">
            <div class="flex gap-4" style="min-height: 22rem;">
              {#each visibleStatuses as statusItem (statusItem.id)}
                <div class="flex min-w-[264px] flex-1 flex-col" role="list">
                  <div class="mb-3 flex shrink-0 items-center gap-2 border-b border-border pb-2.5">
                    <span
                      class="h-2 w-2 shrink-0 rounded-full"
                      style={`background-color: ${statusItem.color}`}
                    ></span>
                    <h3 class="truncate text-xs font-semibold uppercase tracking-wider text-foreground">
                      {statusItem.status}
                    </h3>
                    <span class="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">
                      {getBoardTasks(statusItem.status).length}
                    </span>
                  </div>

                  <div
                    class="flex min-h-0 flex-1 flex-col gap-3"
                    use:dndzone={{
                      items: getBoardTasksDnd(statusItem.status),
                      flipDurationMs,
                      type: "sprint-task",
                    }}
                    onconsider={(e) => handleTaskDndConsider(statusItem.status, e)}
                    onfinalize={(e) => handleTaskDndFinalize(statusItem.status, e)}
                  >
                    {#each getBoardTasksDnd(statusItem.status) as task (task.id)}
                      {@const pc = getPriorityColor(task.priority || "medium")}
                      <article
                        animate:flip={{ duration: flipDurationMs }}
                        class={`group flex cursor-grab flex-col rounded-xl border bg-card p-3 transition-colors active:scale-[0.99] ${
                          task.blocked
                            ? "border-rose-500/40 bg-rose-500/5"
                            : "border-border hover:border-primary"
                        }`}
                      >
                        <button
                          type="button"
                          class="mb-2 w-full text-left"
                          onclick={() => viewTaskDetail(task)}
                        >
                          <h4 class="break-words text-sm font-semibold leading-tight text-foreground">
                            {task.title}
                          </h4>
                        </button>

                        <div class="mb-2 flex flex-wrap items-center gap-1.5">
                          <span
                            class={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${pc.bg} ${pc.border} ${pc.text}`}
                          >
                            {$_(`tasks.priority.${task.priority || "medium"}`)}
                          </span>
                          {#if task.points}
                            <span class="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                              {task.points}
                            </span>
                          {/if}
                          {#if task.blocked}
                            <span class="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-500">
                              <AlertTriangle size={9} />
                              {$_("tasks.blocked")}
                            </span>
                          {/if}
                        </div>

                        <div class="mt-auto flex items-center justify-end gap-1 border-t border-border pt-2">
                          <button
                            type="button"
                            class="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                            onclick={() => viewTaskDetail(task)}
                            aria-label={$_("backlog.view")}
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            class="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                            onclick={() => editTask(task)}
                            aria-label={$_("common.edit")}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            class="rounded p-1 text-muted-foreground transition-colors hover:text-rose-500"
                            onclick={() => removeTask(task)}
                            aria-label={$_("common.delete")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </article>
                    {:else}
                      <div class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 transition-colors hover:border-primary hover:bg-primary/5">
                        <span class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Move size={13} class="opacity-50" />
                          {$_("tasks.dropTasksHere")}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Planned Sprints -->
    {#if plannedSprints.length > 0}
      <section>
        <h2
          class="text-xl font-bold text-foreground mb-4 flex items-center gap-2"
        >
          <Calendar size={20} class="text-primary" />
          {$_("sprints.plannedSprints")}
        </h2>
        <div class="grid gap-5 lg:grid-cols-2">
          {#each plannedSprints as sprint (sprint.id)}
            {@const sprintTasks = getSprintTasks(sprint.id)}
            {@const totalPoints = getTotalPoints(sprintTasks)}
            {@const statusColor = getStatusColor(sprint.status)}

            <!-- Planned sprint: separated by a rule, no enclosing box -->
            <article class="border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div class="mb-3 flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-bold text-foreground sm:text-lg">
                      {sprint.name}
                    </h3>
                    <span
                      class={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor.bg} ${statusColor.border} ${statusColor.text}`}
                    >
                      {sprint.status}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Sprint Goal -->
              {#if sprint.goal}
                <div class="mb-3 space-y-1">
                  <h4 class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Target size={10} />
                    {$_("sprints.sprintGoal")}
                  </h4>
                  <div class="prose prose-xs dark:prose-invert max-w-none text-muted-foreground">
                    {@html marked(sprint.goal)}
                  </div>
                </div>
              {/if}

              <dl class="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                <div class="flex items-baseline gap-1.5">
                  <dd class="font-semibold text-foreground">{sprintTasks.length}</dd>
                  <dt class="text-muted-foreground">{$_("sprints.tasks")}</dt>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <dd class="font-semibold text-foreground">{totalPoints}</dd>
                  <dt class="text-muted-foreground">{$_("sprints.points")}</dt>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <dt class="text-muted-foreground">{$_("sprints.starts")}</dt>
                  <dd class="font-semibold text-foreground">{formatDate(sprint.start)}</dd>
                </div>
              </dl>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="btn btn-primary flex-1 px-3 py-2 text-sm"
                  onclick={() => activateSprint(sprint.id)}
                >
                  <Play size={14} />
                  {$_("sprints.activate")}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary px-3 py-2 text-sm"
                  onclick={() => editSprint(sprint)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost px-3 py-2 text-sm text-rose-500 hover:bg-rose-500 hover:text-white"
                  onclick={() => confirmDeleteSprint(sprint)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Closed Sprints -->
    {#if closedSprints.length > 0}
      <section>
        <h2
          class="text-xl font-bold text-foreground mb-4 flex items-center gap-2"
        >
          <CheckCircle size={20} class="text-muted-foreground" />
          {$_("sprints.completedSprints")}
        </h2>
        <div class="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each closedSprints as sprint (sprint.id)}
            {@const sprintTasks = getSprintTasks(sprint.id)}
            {@const completedTasks = getCompletedTasks(sprintTasks)}
            {@const statusColor = getStatusColor(sprint.status)}

            <!-- Closed sprint: a compact row, dimmed until hovered -->
            <article
              class="border-t border-border py-3 opacity-70 transition-opacity hover:opacity-100"
            >
              <div class="mb-2 flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <h3 class="truncate text-sm font-bold text-foreground">
                    {sprint.name}
                  </h3>
                  <span
                    class={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${statusColor.bg} ${statusColor.border} ${statusColor.text}`}
                  >
                    {sprint.status}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn btn-ghost flex-shrink-0 px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-500 hover:text-white"
                  onclick={() => confirmDeleteSprint(sprint)}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <dl class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
                <div class="flex items-baseline gap-1.5">
                  <dd class="font-semibold text-foreground">
                    {completedTasks.length}/{sprintTasks.length}
                  </dd>
                  <dt class="text-muted-foreground">{$_("sprints.completed")}</dt>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <dt class="text-muted-foreground">{$_("sprints.ended")}</dt>
                  <dd class="font-semibold text-foreground">{formatDate(sprint.end)}</dd>
                </div>
              </dl>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Empty State -->
    {#if sprints.length === 0}
      <div
        class="py-16 text-center"
      >
        <TrendingUp
          size={48}
          class="mx-auto mb-4 text-muted-foreground opacity-50"
        />
        <h3 class="text-lg font-semibold text-foreground mb-2">
          {$_("sprints.noSprints")}
        </h3>
        <p class="text-sm text-muted-foreground mb-4">
          {$_("sprints.createFirstDesc")}
        </p>
        <button type="button" class="btn btn-primary" onclick={openSprintModal}>
          <Plus size={16} />
          {$_("sprints.createFirst")}
        </button>
      </div>
    {/if}
  </div>
</main>

<!-- Sprint Modal -->
<SprintModal
  bind:open={sprintModalOpen}
  mode={sprintModalMode}
  sprint={selectedSprint}
/>

<!-- Confirm Modal -->
<ConfirmModal
  bind:open={confirmModalOpen}
  title={confirmModalType === "complete" ? $_("sprints.completeSprint") : $_("sprint.deleteSprint")}
  message={confirmModalType === "complete" && sprintToComplete
    ? $_("sprints.completeSprintMessage", { values: { name: sprintToComplete.name } })
    : confirmModalType === "delete" && sprintToDelete
      ? $_("sprints.deleteSprintMessage", { values: { name: sprintToDelete.name } })
      : $_("confirmModal.defaultMessage")}
  confirmText={confirmModalType === "complete" ? $_("sprints.completeSprint") : $_("common.delete")}
  cancelText={$_("common.cancel")}
  variant={confirmModalType === "complete" ? "info" : "danger"}
  onConfirm={handleConfirm}
/>

<!-- Task Modal - board tasks are now fully editable from this page -->
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
