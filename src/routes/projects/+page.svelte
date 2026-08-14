<script>
  /**
   * Projects - the top of the hierarchy. Creating one here makes it selectable
   * in the sidebar switcher, and that switcher is what scopes the rest of the
   * app and decides what new sprints and tasks belong to.
   */
  import { _ } from "svelte-i18n";
  import {
    projectStore,
    sprintStore,
    taskStore,
  } from "$lib/stores/index.js";
  import { Plus, Pencil, Trash2 } from "$lib/icons";
  import ProjectModal from "$lib/components/ProjectModal.svelte";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import { toastStore } from "$lib/toastStore.svelte.js";
  import { reveal, staggerChildren } from "$lib/actions/animate.js";

  let modalOpen = $state(false);
  let modalMode = $state("create");
  let editingProject = $state(null);
  let confirmingDelete = $state(null);

  let projects = $derived(projectStore.projects);

  function counts(projectId) {
    const tasks = taskStore.tasks.filter((t) => t.projectId === projectId);
    return {
      tasks: tasks.length,
      done: tasks.filter((t) => t.status === "DONE").length,
      sprints: sprintStore.sprints.filter((s) => s.projectId === projectId).length,
    };
  }

  function startCreate() {
    modalMode = "create";
    editingProject = null;
    modalOpen = true;
  }

  function startEdit(project) {
    modalMode = "edit";
    editingProject = project;
    modalOpen = true;
  }

  function confirmDelete() {
    const id = confirmingDelete?.id;
    if (!id) return;

    projectStore.delete(id, {
      detachSprints: (projectId) => {
        const affected = sprintStore.sprints.filter((s) => s.projectId === projectId);
        affected.forEach((s) => sprintStore.updateQuiet(s.id, { projectId: null }));
        return affected.length;
      },
      detachTasks: (projectId) => {
        const affected = taskStore.tasks.filter((t) => t.projectId === projectId);
        affected.forEach((t) => taskStore.updateQuiet(t.id, { projectId: null }));
        return affected.length;
      },
    });
    confirmingDelete = null;
  }
</script>

<svelte:head><title>{$_("nav.projects")} · FlowStack</title></svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
  <header class="mb-6 flex flex-wrap items-center justify-between gap-3" use:reveal>
    <div>
      <h1 class="text-2xl font-semibold text-foreground">{$_("nav.projects")}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{$_("projects.subtitle")}</p>
    </div>
    <button
      type="button"
      onclick={startCreate}
      class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Plus size={16} />
      {$_("projects.new")}
    </button>
  </header>

  {#if projects.length === 0}
    <p class="py-12 text-center text-sm text-muted-foreground">{$_("projects.empty")}</p>
  {:else}
    <ul class="divide-y divide-border" use:staggerChildren={{ y: 8 }}>
      {#each projects as project (project.id)}
        {@const stat = counts(project.id)}
        <li class="flex items-center gap-4 py-4">
          {#if project.image}
            <img src={project.image} alt="" class="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />
          {:else}
            <span
              class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white"
              style="background-color: {project.color || '#2dd4bf'}"
            >
              {(project.name || "?").trim().charAt(0).toUpperCase()}
            </span>
          {/if}

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium text-foreground">{project.name}</span>
              {#if project.id === projectStore.currentId}
                <span class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {$_("projects.current")}
                </span>
              {/if}
            </div>
            {#if project.slogan}
              <p class="truncate text-sm text-muted-foreground">{project.slogan}</p>
            {/if}
            <p class="mt-0.5 text-xs text-muted-foreground">
              {stat.tasks}
              {$_("projects.tasksLabel")} · {stat.done}
              {$_("projects.doneLabel")} · {stat.sprints}
              {$_("projects.sprintsLabel")}
            </p>
          </div>

          <div class="flex flex-shrink-0 items-center gap-1">
            {#if project.id !== projectStore.currentId}
              <button
                type="button"
                onclick={() => projectStore.setCurrent(project.id)}
                class="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {$_("projects.switchTo")}
              </button>
            {/if}
            <button
              type="button"
              onclick={() => startEdit(project)}
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={$_("common.edit")}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onclick={() => (confirmingDelete = project)}
              class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={$_("common.delete")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<ProjectModal bind:open={modalOpen} mode={modalMode} project={editingProject} />

{#if confirmingDelete}
  <ConfirmModal
    open={true}
    title={$_("projects.deleteTitle")}
    message={$_("projects.deleteMessage", { values: { name: confirmingDelete.name } })}
    confirmText={$_("common.delete")}
    cancelText={$_("common.cancel")}
    variant="danger"
    onConfirm={confirmDelete}
    onCancel={() => (confirmingDelete = null)}
  />
{/if}
