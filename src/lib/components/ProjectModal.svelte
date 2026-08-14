<script>
  /**
   * Create or edit a project. Matches the modal pattern the other entities use
   * (SprintModal, UserModal) rather than the inline form this replaced.
   */
  import { _ } from "svelte-i18n";
  import Modal from "../Modal.svelte";
  import { Upload, X } from "$lib/icons";
  import { projectStore, adoptUnassignedInto } from "../stores/index.js";
  import { toastStore } from "../toastStore.svelte.js";

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

  let { open = $bindable(false), mode = "create", project = null } = $props();

  let form = $state({ name: "", slogan: "", color: PALETTE[0], image: null });

  // Refill whenever the modal is opened, so a cancelled edit never leaks its
  // values into the next one
  $effect(() => {
    if (!open) return;
    form =
      mode === "edit" && project
        ? {
            name: project.name || "",
            slogan: project.slogan || "",
            color: project.color || PALETTE[0],
            image: project.image || null,
          }
        : {
            name: "",
            slogan: "",
            color: PALETTE[projectStore.projects.length % PALETTE.length],
            image: null,
          };
  });

  function closeModal() {
    open = false;
  }

  /**
   * Images are inlined as data URIs: there is no asset directory and no server,
   * so a file path would break as soon as the source file moved.
   */
  function pickImage(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toastStore.error($_("projects.imageInvalid"));
      return;
    }
    // The snapshot is read whole on every load, so keep this small
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

  function handleSubmit(event) {
    event?.preventDefault();

    const name = form.name.trim();
    if (!name) {
      toastStore.error($_("projects.nameRequired"));
      return;
    }

    if (mode === "edit" && project) {
      projectStore.update(project.id, { ...form, name });
    } else {
      const wasFirst = projectStore.projects.length === 0;
      const created = projectStore.create({ ...form, name });
      projectStore.setCurrent(created.id);

      // Nothing should sit outside every project and be unreachable in the
      // filtered views, so the first project sweeps up anything unassigned
      if (wasFirst) {
        const adopted = adoptUnassignedInto(created.id);
        if (adopted.tasks || adopted.sprints) {
          toastStore.info(
            $_("projects.adopted", {
              values: { tasks: adopted.tasks, sprints: adopted.sprints },
            })
          );
        }
      }
    }

    closeModal();
  }
</script>

{#snippet modalChildren()}
  <form id="project-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
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
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
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
  </form>
{/snippet}

{#snippet modalFooter()}
  <button type="button" class="btn btn-secondary" onclick={closeModal}>
    {$_("common.cancel")}
  </button>
  <button type="submit" form="project-form" class="btn btn-primary">
    {mode === "edit" ? $_("common.save") : $_("projects.create")}
  </button>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? $_("projects.editing") : $_("projects.new")}
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
