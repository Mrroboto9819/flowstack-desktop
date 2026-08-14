<script>
  import { Plus, Pencil, Target, TrendingUp, Eye, Layers3 } from "$lib/icons";
  import { taskStore, sprintStore, projectStore } from "../../lib/stores/index.js";
  import TaskModal from "../../lib/components/TaskModal.svelte";
  import TaskDetailModal from "../../lib/components/TaskDetailModal.svelte";
  import { toastStore } from "../../lib/toastStore.svelte.js";
  import { marked } from "marked";
  import { _ } from "$lib/i18n";
  import Skeleton from "../../lib/components/Skeleton.svelte";
  import { appState } from "../../lib/stores/app.svelte.js";
  import { staggerChildren } from "$lib/actions/animate.js";

  // Archived tasks are hidden here as well - the flag means "not on my board",
  // not "not on the Tasks page"
  let allTasks = $derived(
    taskStore.tasks.filter((t) => projectStore.inScope(t) && !t.archived)
  );
  let sprints = $derived(sprintStore.sprints.filter((s) => projectStore.inScope(s)));

  // Modal state
  let taskModalOpen = $state(false);
  let taskModalMode = $state("create");
  let selectedTask = $state(null);

  // Detail modal state
  let detailModalOpen = $state(false);
  let detailTask = $state(null);

  // Get backlog items (tasks without sprint)
  let backlogItems = $derived(allTasks.filter((task) => !task.sprintId));

  // Get active sprint
  let activeSprint = $derived(sprints.find((s) => s.status === "active"));

  // Calculate total points
  function getTotalPoints(tasks) {
    return tasks.reduce((sum, task) => {
      const points = parseInt(task.points) || 0;
      return sum + points;
    }, 0);
  }

  // Task modal functions
  function openTaskModal() {
    taskModalMode = "create";
    selectedTask = null;
    taskModalOpen = true;
  }

  function editTask(task) {
    taskModalMode = "edit";
    selectedTask = task;
    taskModalOpen = true;
  }

  function viewTaskDetail(task) {
    detailTask = task;
    detailModalOpen = true;
  }

  // Move task to active sprint
  function moveToSprint(taskId) {
    if (!activeSprint) {
      toastStore.warning($_("backlog.noActiveSprint"));
      return;
    }
    taskStore.update(taskId, { sprintId: activeSprint.id });
    toastStore.success($_("backlog.taskAddedToSprint"));
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
</script>

<main class="min-h-screen px-4 pt-6 pb-10 sm:px-6">
  <!-- Page header: title, counts and action, separated by a rule -->
  <header class="mb-6 border-b border-border pb-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("backlog.title")}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{$_("backlog.description")}</p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        onclick={openTaskModal}
      >
        <Plus size={16} />
        {$_("backlog.newItem")}
      </button>
    </div>

    <!-- Figures as a line of text rather than three boxes -->
    <dl class="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
      <div class="flex items-baseline gap-1.5">
        <dd class="font-semibold text-foreground">{backlogItems.length}</dd>
        <dt class="text-muted-foreground">{$_("backlog.items")}</dt>
      </div>
      <div class="flex items-baseline gap-1.5">
        <dd class="font-semibold text-foreground">{getTotalPoints(backlogItems)}</dd>
        <dt class="text-muted-foreground">{$_("backlog.pointsInBacklog")}</dt>
      </div>
      <div class="flex items-baseline gap-1.5">
        <dt class="text-muted-foreground">{$_("backlog.activeSprint")}</dt>
        <dd class="font-semibold text-foreground">
          {activeSprint ? activeSprint.name : $_("common.none")}
        </dd>
      </div>
    </dl>
  </header>

  <div class="space-y-6">
    <!-- Backlog List -->
    <section>
      <h2 class="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {$_("backlog.itemsList")}
      </h2>

      {#if !appState.ready}
        <div class="grid gap-4 lg:grid-cols-2" use:staggerChildren>
          {#each Array(4) as _, i}
            <div class="rounded-xl border border-border bg-card p-4">
              <Skeleton variant="title" width="{80 - i * 10}%" />
              <div class="mt-3 flex gap-1.5">
                <Skeleton variant="chip" />
                <Skeleton variant="chip" class="w-10" />
              </div>
              <div class="mt-3"><Skeleton width="55%" /></div>
            </div>
          {/each}
        </div>
      {:else}
      <div class="grid gap-4 lg:grid-cols-2">
        {#each backlogItems as task (task.id)}
          {@const priorityColor = getPriorityColor(task.priority || "medium")}
          <!-- The item is the only surface on this page -->
          <article class="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
            <div class="flex items-start justify-between gap-3">
              <!-- Content -->
              <div class="flex-1 min-w-0">
                <button
                  type="button"
                  class="text-left w-full mb-2"
                  onclick={() => viewTaskDetail(task)}
                >
                  <h4 class="text-base font-bold text-foreground leading-tight break-words">
                    {task.title}
                  </h4>
                </button>

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

                <!-- Badges -->
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                    {$_(`tasks.types.${task.type || "story"}`)}
                  </span>

                  {#if task.points}
                    <span class="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {task.points} {$_("backlog.pts")}
                    </span>
                  {/if}

                  <span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor.bg} ${priorityColor.border} ${priorityColor.text}`}>
                    {$_(`tasks.priority.${task.priority || "medium"}`)}
                  </span>

                  {#if task.epic}
                    <span class="inline-flex items-center rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                      <Target size={10} class="mr-1" />
                      {task.epic}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex flex-col gap-2 flex-shrink-0">
                {#if activeSprint}
                  <button
                    type="button"
                    class="btn btn-primary px-3 py-1.5 text-[11px] whitespace-nowrap"
                    onclick={() => moveToSprint(task.id)}
                    title="{$_('backlog.addToSprint')} - {activeSprint.name}"
                  >
                    <TrendingUp size={12} />
                    {$_("backlog.addToSprint")}
                  </button>
                {/if}
                <button
                  type="button"
                  class="btn btn-secondary px-3 py-1.5 text-[11px]"
                  onclick={() => editTask(task)}
                >
                  <Pencil size={12} />
                  {$_("common.edit")}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost px-3 py-1.5 text-[11px]"
                  onclick={() => viewTaskDetail(task)}
                >
                  <Eye size={12} />
                  {$_("backlog.view")}
                </button>
              </div>
            </div>
          </article>
        {:else}
          <div class="py-16 text-center lg:col-span-2">
            <p class="text-sm text-muted-foreground">
              {$_("backlog.empty")} {$_("backlog.emptyMessage")}
            </p>
            <button
              type="button"
              class="btn btn-primary mt-4"
              onclick={openTaskModal}
            >
              <Plus size={16} />
              {$_("backlog.createFirst")}
            </button>
          </div>
        {/each}
      </div>
      {/if}
    </section>
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
  onDelete={(task) => {
    taskStore.delete(task.id);
    detailModalOpen = false;
  }}
/>
