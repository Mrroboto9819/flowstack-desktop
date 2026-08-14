<script>
  /**
   * Shown instead of the board when no project exists yet.
   *
   * Tasks and sprints belong to a project, so letting someone create work
   * before there is one to hold it just produces orphans. Rather than a dead
   * end, this offers both ways forward: create one right here, or go to the
   * projects page.
   */
  import { _ } from "svelte-i18n";
  import { Briefcase, Plus } from "$lib/icons";
  import ProjectModal from "./ProjectModal.svelte";
  import { reveal } from "$lib/actions/animate.js";

  let modalOpen = $state(false);
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" use:reveal>
  <span class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
    <Briefcase size={28} class="text-primary" />
  </span>

  <h2 class="text-xl font-semibold text-foreground">{$_("projects.gateTitle")}</h2>
  <p class="mt-2 max-w-md text-sm text-muted-foreground">{$_("projects.gateBody")}</p>

  <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
    <button
      type="button"
      onclick={() => (modalOpen = true)}
      class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Plus size={16} />
      {$_("projects.new")}
    </button>
    <a
      href="/projects"
      class="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {$_("projects.manage")}
    </a>
  </div>
</div>

<ProjectModal bind:open={modalOpen} mode="create" />
