<script>
  /**
   * Projects - the top of the hierarchy. Creating one here makes it selectable
   * in the sidebar switcher, and that switcher is what scopes the rest of the
   * app and decides what new sprints and tasks belong to.
   */
  import { _ } from "svelte-i18n";
  import { projectStore, sprintStore, taskStore } from "$lib/stores/index.js";
  import { Plus, Pencil, Trash2, Check, X, Upload } from "$lib/icons";
  import ConfirmModal from "$lib/components/ConfirmModal.svelte";
  import { toastStore } from "$lib/toastStore.svelte.js";

  const PALETTE = [
    "#2dd4bf",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#84cc16",
    "#06b6d4",
    "#f59e0b",
  ];

  // An inline form rather than a modal - one less layer, matching the flat
  // treatment the other views use
  let editingId = $state(null);
  let creating = $state(false);
  let form = $state({ name: "", slogan: "", color: PALETTE[0], image: null });
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
    creating = true;
    editingId = null;
    form = {
      name: "",
      slogan: "",
      color: PALETTE[projects.length % PALETTE.length],
      image: null,
    };
  }

  function startEdit(project) {
    creating = false;
    editingId = project.id;
    form = {
      name: project.name || "",
      slogan: project.slogan || "",
      color: project.color || PALETTE[0],
      image: project.image || null,
    };
  }

  function cancel() {
    creating = false;
    editingId = null;
  }

  function submit() {
    const name = form.name.trim();
    if (!name) {
      toastStore.error($_("projects.nameRequired"));
      return;
    }

    if (editingId) {
      projectStore.update(editingId, { ...form, name });
    } else {
      const created = projectStore.create({ ...form, name });
      // A brand new project is almost always what you want to work in next
      projectStore.setCurrent(created.id);
    }
    cancel();
  }

  /**
   * Images are stored inline as data URIs. There is no asset directory and no
   * server, so a file path would break the moment the source file moved.
   */
  function pickImage(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toastStore.error($_("projects.imageInvalid"));
      return;
    }
    // Data URIs live in the snapshot, which is read whole on every load
    if (file.size > 512 * 1024) {
      toastStore.error($_("projects.imageTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      form.image = String(reader.result);
    };
    reader.readAsDataURL(file);
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
  <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
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

  {#if creating || editingId}
    <section class="mb-8 border-b border-border pb-8">
      <h2 class="mb-4 text-sm font-medium text-foreground">
        {editingId ? $_("projects.editing") : $_("projects.new")}
      </h2>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {$_("projects.name")}
          </span>
          <input
            bind:value={form.name}
            type="text"
            placeholder={$_("projects.namePlaceholder")}
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        <label class="block">
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {$_("projects.slogan")}
          </span>
          <input
            bind:value={form.slogan}
            type="text"
            placeholder={$_("projects.sloganPlaceholder")}
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      </div>

      <div class="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {$_("projects.color")}
          </span>
          <div class="flex flex-wrap gap-2">
            {#each PALETTE as swatch}
              <button
                type="button"
                onclick={() => (form.color = swatch)}
                class="h-8 w-8 rounded-md ring-offset-2 ring-offset-background transition-all {form.color ===
                swatch
                  ? 'ring-2 ring-primary'
                  : ''}"
                style="background-color: {swatch}"
                aria-label={swatch}
              ></button>
            {/each}
          </div>
        </div>

        <div>
          <span class="mb-1.5 block text-xs font-medium text-muted-foreground">
            {$_("projects.image")}
          </span>
          <div class="flex items-center gap-3">
            {#if form.image}
              <img src={form.image} alt="" class="h-12 w-12 rounded-lg object-cover" />
              <button
                type="button"
                onclick={() => (form.image = null)}
                class="text-xs text-muted-foreground underline hover:text-foreground"
              >
                {$_("projects.removeImage")}
              </button>
            {:else}
              <span
                class="flex h-12 w-12 items-center justify-center rounded-lg text-lg font-semibold text-white"
                style="background-color: {form.color}"
              >
                {(form.name || "?").trim().charAt(0).toUpperCase()}
              </span>
            {/if}
            <label
              class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-xs text-foreground transition-colors hover:bg-accent"
            >
              <Upload size={14} />
              {$_("projects.upload")}
              <input type="file" accept="image/*" onchange={pickImage} class="hidden" />
            </label>
          </div>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <button
          type="button"
          onclick={submit}
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Check size={16} />
          {editingId ? $_("common.save") : $_("projects.create")}
        </button>
        <button
          type="button"
          onclick={cancel}
          class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={16} />
          {$_("common.cancel")}
        </button>
      </div>
    </section>
  {/if}

  {#if projects.length === 0}
    <p class="py-12 text-center text-sm text-muted-foreground">{$_("projects.empty")}</p>
  {:else}
    <ul class="divide-y divide-border">
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
