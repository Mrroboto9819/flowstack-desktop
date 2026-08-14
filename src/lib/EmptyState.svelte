<script>
  import {
    Inbox,
    Users,
    Layers3,
    Calendar,
    KanbanSquare,
  } from "$lib/icons";

  let {
    icon = "inbox",
    title = "No items found",
    description = "Get started by creating your first item.",
    actionText = "",
    onAction = () => {},
  } = $props();

  const icons = {
    inbox: Inbox,
    users: Users,
    layers: Layers3,
    calendar: Calendar,
    kanban: KanbanSquare,
  };

  let IconComponent = $derived(icons[icon] || icons.inbox);
</script>

<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
  <div class="rounded-full bg-muted p-4 mb-4">
    <IconComponent size={32} class="text-muted-foreground" />
  </div>
  <h3 class="text-lg font-semibold text-foreground mb-2">
    {title}
  </h3>
  <p class="text-sm text-muted-foreground max-w-md mb-6">
    {description}
  </p>
  {#if actionText}
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
      onclick={onAction}
    >
      {actionText}
    </button>
  {/if}
</div>
