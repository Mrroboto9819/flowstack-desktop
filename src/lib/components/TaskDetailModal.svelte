<script>
  import { X, Pencil, Trash2, Calendar, User, Target, Tag, Clock, Hash, AlertCircle, Activity, Layers3, CheckCircle2, AlertTriangle, ListTodo, Check, Link2, Copy } from "lucide-svelte";
  import { marked } from "marked";
  import { sprintStore, taskStore, settingsStore } from "../stores/index.js";
  import { toastStore } from "../toastStore.svelte.js";
  import { formatTaskForClipboard, copyToClipboard } from "../utils/clipboard.js";
  import { _ } from "$lib/i18n";
  import TaskTimer from "./TaskTimer.svelte";

  // Get methodology from settings
  let methodology = $derived(settingsStore.settings.methodology || "agile");

  let {
    open = $bindable(false),
    task = null,
    onEdit = () => {},
    onDelete = () => {},
  } = $props();

  let sprints = $derived(sprintStore.sprints);
  let allTasks = $derived(taskStore.tasks);

  // Get related tasks details
  let relatedTasksDetails = $derived(
    task?.relatedTasks && Array.isArray(task.relatedTasks)
      ? task.relatedTasks
          .map((id) => allTasks.find((t) => t.id === id))
          .filter(Boolean)
      : []
  );

  function handleClose() {
    open = false;
  }

  function handleEdit() {
    onEdit(task);
    open = false;
  }

  function handleDelete() {
    onDelete(task);
    open = false;
  }

  async function handleCopy() {
    if (!task) return;
    const text = formatTaskForClipboard(task, { allTasks, sprints });
    const success = await copyToClipboard(text);
    if (success) {
      toastStore.success($_("tasks.taskCopied"));
    }
  }

  const priorityColors = {
    critical: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-500" },
    high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
    medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-500" },
    low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  };

  const typeColors = {
    story: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary" },
    bug: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-500" },
    chore: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" },
  };

  function getPriorityColor(priority) {
    return priorityColors[priority] || priorityColors.medium;
  }

  function getTypeColor(type) {
    return typeColors[type] || typeColors.story;
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

{#if open && task}
  {@const priorityColor = getPriorityColor(task.priority || "medium")}
  {@const typeColor = getTypeColor(task.type || "story")}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/60 backdrop-blur-md transition-all"
      aria-label="Close modal"
      onclick={handleClose}
    ></button>

    <!-- Modal -->
    <div
      class="relative z-10 flex w-full flex-col max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <header class="flex flex-none items-center justify-between border-b border-border px-6 py-4">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <h2 class="text-lg font-bold text-foreground truncate">
            {task.title}
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            onclick={handleCopy}
            title={$_("tasks.copyTask")}
          >
            <Copy size={14} />
            {$_("tasks.copyTask")}
          </button>
          <button
            type="button"
            class="btn btn-secondary px-3 py-2 text-sm"
            onclick={handleEdit}
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            type="button"
            class="btn btn-ghost px-3 py-2 text-sm text-rose-500 hover:bg-rose-500 hover:text-white"
            onclick={handleDelete}
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button
            type="button"
            class="rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
            onclick={handleClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-6">
        <div class="space-y-6">
          <!-- Top Badges -->
          <div class="flex flex-wrap items-center gap-2">

            <span class={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${typeColor.bg} ${typeColor.border} ${typeColor.text}`}>
              {task.type || "story"}
            </span>

            <span class={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${priorityColor.bg} ${priorityColor.border} ${priorityColor.text}`}>
              <AlertCircle size={12} />
              {task.priority || "medium"}
            </span>

            {#if task.points}
              <span class="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                <Hash size={12} />
                {task.points} pts
              </span>
            {/if}

            {#if task.time}
              <span class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                <Clock size={12} />
                {task.time}
              </span>
            {/if}

            {#if task.blocked}
              <span class="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-500">
                <AlertTriangle size={12} />
                Blocked
              </span>
            {/if}
          </div>

          <!-- Timer -->
          <div class="space-y-2">
            <h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Clock size={14} />
              Time Tracker
            </h3>
            <div class="rounded-lg border border-border bg-background p-4">
              <TaskTimer
                taskId={task.id}
                elapsedSeconds={task.elapsedSeconds || 0}
                timerStartedAt={task.timerStartedAt || null}
                isRunning={task.timerRunning || false}
                onStart={(id) => taskStore.startTimer(id)}
                onPause={(id) => taskStore.pauseTimer(id)}
                onReset={(id) => taskStore.resetTimer(id)}
                compact={false}
              />
            </div>
          </div>

          <!-- Description -->
          {#if task.description}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                Description
              </h3>
              <div class="rounded-lg border border-border bg-background p-4 prose prose-sm dark:prose-invert max-w-none">
                {@html marked(task.description)}
              </div>
            </div>
          {/if}

          <!-- Acceptance Criteria -->
          {#if task.acceptance}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <CheckCircle2 size={14} />
                Acceptance Criteria
              </h3>
              <div class="rounded-lg border border-border bg-background p-4">
                <p class="text-sm text-foreground whitespace-pre-wrap">{task.acceptance}</p>
              </div>
            </div>
          {/if}

          <!-- Subtasks -->
          {#if task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <ListTodo size={14} />
                Subtasks
              </h3>
              <div class="rounded-lg border border-border bg-background p-4 space-y-2">
                {#each task.subtasks as subtask (subtask.id)}
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 rounded-lg p-2 hover:bg-muted/50 transition-all text-left"
                    onclick={() => taskStore.toggleSubtask(task.id, subtask.id)}
                  >
                    <div
                      class={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all ${
                        subtask.completed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      {#if subtask.completed}
                        <Check size={12} />
                      {/if}
                    </div>
                    <span
                      class={`flex-1 text-sm ${
                        subtask.completed
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {subtask.text}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Blocker Reason -->
          {#if task.blocked && task.blocker}
            <div class="space-y-2">
              <h3 class="text-sm font-semibold uppercase tracking-wide text-rose-500 flex items-center gap-2">
                <AlertTriangle size={14} />
                Blocker Reason
              </h3>
              <div class="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <p class="text-sm text-foreground">{task.blocker}</p>
              </div>
            </div>
          {/if}

          <!-- Details Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Status -->
            <div class="space-y-1">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Activity size={12} />
                Status
              </div>
              <div class="text-sm font-medium text-foreground">
                {task.status}
              </div>
            </div>

            <!-- Assigned -->
            {#if task.asign}
              <div class="space-y-1">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <User size={12} />
                  Assigned
                </div>
                <div class="text-sm font-medium text-foreground">
                  {task.asign}
                </div>
              </div>
            {/if}

            <!-- Epic -->
            {#if task.epic}
              <div class="space-y-1">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Target size={12} />
                  Epic
                </div>
                <div class="text-sm font-medium text-foreground">
                  {task.epic}
                </div>
              </div>
            {/if}

            <!-- Sprint (Agile only) -->
            {#if methodology === "agile" && task.sprintId}
              {@const sprint = sprints.find(s => s.id === task.sprintId)}
              <div class="space-y-1">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Layers3 size={12} />
                  Sprint
                </div>
                <div class="text-sm font-medium text-foreground">
                  {sprint?.name || task.sprintId}
                </div>
              </div>
            {/if}

            <!-- Created -->
            <div class="space-y-1">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Calendar size={12} />
                Created
              </div>
              <div class="text-sm font-medium text-foreground">
                {formatDate(task.created)}
              </div>
            </div>

            <!-- Updated -->
            <div class="space-y-1">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Calendar size={12} />
                Updated
              </div>
              <div class="text-sm font-medium text-foreground">
                {formatDate(task.updated)}
              </div>
            </div>
          </div>

          <!-- Tags -->
          {#if task.tags && task.tags.length > 0}
            <div class="space-y-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Tag size={12} />
                Tags
              </h3>
              <div class="flex flex-wrap gap-2">
                {#each task.tags as tag}
                  <span class="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                    {tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Related Tasks -->
          {#if relatedTasksDetails.length > 0}
            <div class="space-y-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Link2 size={12} />
                Related Tasks
              </h3>
              <div class="rounded-lg border border-border bg-background p-3 space-y-2">
                {#each relatedTasksDetails as relatedTask (relatedTask.id)}
                  {@const relatedPriorityColor = getPriorityColor(relatedTask.priority || "medium")}
                  <div class="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-all">
                    <Link2 size={14} class="text-muted-foreground flex-shrink-0" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-foreground truncate">{relatedTask.title}</p>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class={`text-[10px] font-semibold uppercase ${relatedPriorityColor.text}`}>
                          {relatedTask.priority || "medium"}
                        </span>
                        <span class="text-[10px] text-muted-foreground">•</span>
                        <span class="text-[10px] text-muted-foreground">{relatedTask.status}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Task ID -->
          <div class="pt-4 border-t border-border">
            <div class="text-[10px] uppercase tracking-wide text-muted-foreground">
              Task ID: {task.id}
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="flex-none border-t border-border px-6 py-4 bg-muted/30">
        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="btn btn-secondary"
            onclick={handleClose}
          >
            Close
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onclick={handleEdit}
          >
            <Pencil size={14} />
            Edit Task
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}
