<script>
  import {
    Plus,
    Settings,
    Trash2,
    Pencil,
    Tag,
    LayoutGrid,
    Palette,
    Eye,
    EyeOff,
    GripVertical,
    Lock,
    Plug,
    Copy,
  } from "$lib/icons";
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { statusStore, tagStore, taskStore, settingsStore, persistenceInfo } from "../../lib/stores/index.js";
  import { toastStore } from "../../lib/toastStore.svelte.js";
  import StandardSwitch from "../../lib/StandardSwitch.svelte";
  import StatusModal from "../../lib/components/StatusModal.svelte";
  import TagModal from "../../lib/components/TagModal.svelte";
  import ConfirmModal from "../../lib/components/ConfirmModal.svelte";
  import { _ } from "$lib/i18n";

  let statuses = $derived(statusStore.statuses);
  let allTasks = $derived(taskStore.tasks);

  // Showing how much a column or tag is actually used is more useful than a
  // creation date - and imported records have no `created`, which rendered as
  // "Invalid Date"
  const taskCountFor = (status) => allTasks.filter((t) => t.status === status).length;
  const tagUsage = (tagId) => allTasks.filter((t) => (t.tagIds || []).includes(tagId)).length;
  let tags = $derived(tagStore.tags);

  // MCP permissions. The server reads these out of the snapshot on every call,
  // so a toggle here takes effect on the next tool use - no restart needed.
  let mcp = $derived(
    settingsStore.settings.mcp || { enabled: true, allowWrite: false, allowDelete: false }
  );

  function setMcp(patch) {
    settingsStore.update({ mcp: { ...mcp, ...patch } });
  }

  async function copyMcpConfig() {
    const config = JSON.stringify(
      { mcpServers: { flowstack: { command: "node", args: ["mcp/server.js"] } } },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(config);
      toastStore.success("MCP config copied");
    } catch {
      toastStore.error("Could not copy to clipboard");
    }
  }
  const flipDurationMs = 200;

  // Drag and drop state
  let draggingItems = $state(null);
  let visibleStatuses = $derived(draggingItems || statuses);

  // Active tab
  let activeTab = $state("statuses");

  // Status modal state
  let statusModalOpen = $state(false);
  let statusModalMode = $state("create");
  let selectedStatus = $state(null);

  // Tag modal state
  let tagModalOpen = $state(false);
  let tagModalMode = $state("create");
  let selectedTag = $state(null);

  // Confirm modal state
  let confirmModalOpen = $state(false);
  let confirmModalType = $state("delete-status"); // "delete-status" or "delete-tag"
  let itemToDelete = $state(null);

  // Status functions
  function openStatusModal() {
    statusModalMode = "create";
    selectedStatus = null;
    statusModalOpen = true;
  }

  function editStatus(status) {
    statusModalMode = "edit";
    selectedStatus = status;
    statusModalOpen = true;
  }

  function confirmDeleteStatus(status) {
    confirmModalType = "delete-status";
    itemToDelete = status;
    confirmModalOpen = true;
  }

  function toggleStatusVisibility(id) {
    const status = statusStore.getById(id);
    if (status) {
      statusStore.update(id, { show: !status.show });
    }
  }

  // Tag functions
  function openTagModal() {
    tagModalMode = "create";
    selectedTag = null;
    tagModalOpen = true;
  }

  function editTag(tag) {
    tagModalMode = "edit";
    selectedTag = tag;
    tagModalOpen = true;
  }

  function confirmDeleteTag(tag) {
    confirmModalType = "delete-tag";
    itemToDelete = tag;
    confirmModalOpen = true;
  }

  // Confirm delete handler
  function handleConfirmDelete() {
    if (!itemToDelete) return;

    if (confirmModalType === "delete-status") {
      statusStore.delete(itemToDelete.id);
    } else if (confirmModalType === "delete-tag") {
      tagStore.delete(itemToDelete.id);
    }

    itemToDelete = null;
  }

  function getConfirmModalConfig() {
    if (confirmModalType === "delete-status" && itemToDelete) {
      return {
        title: $_("settings.statuses.deleteTitle"),
        message: $_("settings.statuses.deleteMessage", { values: { name: itemToDelete.status } }),
      };
    } else if (confirmModalType === "delete-tag" && itemToDelete) {
      return {
        title: $_("settings.tags.deleteTitle"),
        message: $_("settings.tags.deleteMessage", { values: { name: itemToDelete.name } }),
      };
    }
    return {
      title: $_("confirmModal.defaultTitle"),
      message: $_("confirmModal.defaultMessage"),
    };
  }

  let modalConfig = $derived(getConfirmModalConfig());

  // Drag and drop handlers
  function handleDndConsider(e) {
    console.log("DND Consider:", e.detail);
    draggingItems = e.detail.items;
  }

  function handleDndFinalize(e) {
    console.log("DND Finalize:", e.detail);
    draggingItems = e.detail.items;
    statusStore.updateOrder(e.detail.items);
    draggingItems = null;
  }
</script>

<main class="min-h-screen px-4 pt-6 pb-10 sm:px-6">
  <!-- Header -->
  <header class="mb-5">
    <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("settings.title")}</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      {$_("settings.description")}
    </p>
  </header>

  <!-- Tabs -->
  <div class="mb-6 border-b border-border">
    <div class="flex gap-1">
      <button
        type="button"
        class="px-4 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2"
        class:border-primary={activeTab === "statuses"}
        class:text-primary={activeTab === "statuses"}
        class:border-transparent={activeTab !== "statuses"}
        class:text-muted-foreground={activeTab !== "statuses"}
        onclick={() => (activeTab = "statuses")}
      >
        <LayoutGrid size={16} />
        {$_("settings.tabs.statuses")}
        <span
          class="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
        >
          {statuses.length}
        </span>
      </button>
      <button
        type="button"
        class="px-4 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2"
        class:border-primary={activeTab === "tags"}
        class:text-primary={activeTab === "tags"}
        class:border-transparent={activeTab !== "tags"}
        class:text-muted-foreground={activeTab !== "tags"}
        onclick={() => (activeTab = "tags")}
      >
        <Tag size={16} />
        {$_("settings.tabs.tags")}
        <span
          class="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
        >
          {tags.length}
        </span>
      </button>
      <button
        type="button"
        class="px-4 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2"
        class:border-primary={activeTab === "mcp"}
        class:text-primary={activeTab === "mcp"}
        class:border-transparent={activeTab !== "mcp"}
        class:text-muted-foreground={activeTab !== "mcp"}
        onclick={() => (activeTab = "mcp")}
      >
        <Plug size={16} />
        MCP access
        {#if !mcp.enabled}
          <span class="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            off
          </span>
        {:else if mcp.allowWrite}
          <span class="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {mcp.allowDelete ? "full" : "write"}
          </span>
        {:else}
          <span class="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            read
          </span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Status Columns Tab -->
  {#if activeTab === "statuses"}
    <div class="space-y-4">
      <!-- Header with action button -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-foreground">{$_("settings.statuses.title")}</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {$_("settings.statuses.description")}
          </p>
        </div>
        <button type="button" class="btn btn-primary" onclick={openStatusModal}>
          <Plus size={16} />
          {$_("settings.statuses.newStatus")}
        </button>
      </div>

      <!-- Status List -->
      <div class="space-y-3">
        {#if statuses.length === 0}
          <div
            class="py-16 text-center"
          >
            <LayoutGrid
              size={48}
              class="mx-auto mb-4 text-muted-foreground opacity-50"
            />
            <h3 class="text-lg font-semibold text-foreground mb-2">
              {$_("settings.statuses.noStatuses")}
            </h3>
            <p class="text-sm text-muted-foreground mb-4">
              {$_("settings.statuses.createFirstDesc")}
            </p>
            <button
              type="button"
              class="btn btn-primary"
              onclick={openStatusModal}
            >
              <Plus size={16} />
              {$_("settings.statuses.createFirst")}
            </button>
          </div>
        {:else}
          <div
            use:dndzone={{ items: visibleStatuses, flipDurationMs }}
            onconsider={handleDndConsider}
            onfinalize={handleDndFinalize}
            class="divide-y divide-border border-y border-border outline-none"
          >
            {#each visibleStatuses as status (status.id)}
              <article
                animate:flip={{ duration: flipDurationMs }}
                class="group flex cursor-move items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div class="flex items-center gap-4 flex-1 min-w-0">
                  <GripVertical
                    size={18}
                    class="text-muted-foreground flex-shrink-0"
                  />
                  <div
                    class="w-5 h-5 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-offset-card"
                    style="background-color: {status.color}; ring-color: {status.color}40"
                  ></div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-base font-bold text-foreground flex items-center gap-2">
                      {status.status}
                      {#if status.isSystem}
                        <Lock size={14} class="text-muted-foreground" title={$_("settings.statuses.systemStatus")} />
                      {/if}
                    </h3>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {taskCountFor(status.status)}
                      {taskCountFor(status.status) === 1 ? "task" : "tasks"}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3 flex-shrink-0">
                  <div
                    class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50"
                  >
                    {#if status.show}
                      <Eye size={14} class="text-primary" />
                      <span class="text-xs font-medium text-foreground"
                        >{$_("settings.statuses.visible")}</span
                      >
                    {:else}
                      <EyeOff size={14} class="text-muted-foreground" />
                      <span class="text-xs font-medium text-muted-foreground"
                        >{$_("settings.statuses.hidden")}</span
                      >
                    {/if}
                    <StandardSwitch
                      checked={status.show}
                      color={status.color}
                      onchange={() => toggleStatusVisibility(status.id)}
                    />
                  </div>

                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="btn btn-ghost px-2 py-1 text-[10px]"
                      onclick={() => editStatus(status)}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    {#if !status.isSystem}
                      <button
                        type="button"
                        class="btn btn-ghost px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-500 hover:text-white"
                        onclick={() => confirmDeleteStatus(status)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    {/if}
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>

      <p class="border-l-2 border-border pl-4 text-xs text-muted-foreground">
        {$_("settings.statuses.tip")}
      </p>
    </div>
  {/if}

  <!-- Tags Tab -->
  {#if activeTab === "tags"}
    <div class="space-y-4">
      <!-- Header with action button -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-foreground">{$_("settings.tags.title")}</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {$_("settings.tags.description")}
          </p>
        </div>
        <button type="button" class="btn btn-primary" onclick={openTagModal}>
          <Plus size={16} />
          {$_("settings.tags.newTag")}
        </button>
      </div>

      <!-- Tags Grid -->
      {#if tags.length === 0}
        <div
          class="py-16 text-center"
        >
          <Tag
            size={48}
            class="mx-auto mb-4 text-muted-foreground opacity-50"
          />
          <h3 class="text-lg font-semibold text-foreground mb-2">{$_("settings.tags.noTags")}</h3>
          <p class="text-sm text-muted-foreground mb-4">
            {$_("settings.tags.createFirstDesc")}
          </p>
          <button type="button" class="btn btn-primary" onclick={openTagModal}>
            <Plus size={16} />
            {$_("settings.tags.createFirst")}
          </button>
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each tags as tag (tag.id)}
            <article
              class="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary"
            >
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex-1 min-w-0">
                  <div
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium mb-2"
                    style="background-color: {tag.color}15; border-color: {tag.color}40; color: {tag.color}"
                  >
                    <Tag size={12} />
                    {tag.name}
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {tagUsage(tag.id)} {tagUsage(tag.id) === 1 ? "task" : "tasks"}
                  </p>
                </div>

                <div
                  class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    type="button"
                    class="btn btn-ghost px-2 py-1 text-[10px]"
                    onclick={() => editTag(tag)}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-500 hover:text-white"
                    onclick={() => confirmDeleteTag(tag)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-border">
                <Palette size={12} class="text-muted-foreground" />
                <code class="text-xs text-muted-foreground font-mono"
                  >{tag.color}</code
                >
              </div>
            </article>
          {/each}
        </div>
      {/if}

      <!-- Info Box -->
      <p class="border-l-2 border-border pl-4 text-xs text-muted-foreground">
        {$_("settings.tags.tip")}
      </p>
    </div>
  {/if}

  <!-- MCP Access Tab -->
  {#if activeTab === "mcp"}
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-foreground">MCP access</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Let an AI assistant read and change this board through the FlowStack MCP
          server. The server runs as a separate process and checks these
          permissions on every request.
        </p>
      </div>

      <div class="divide-y divide-border border-y border-border">
        <div class="flex items-start justify-between gap-6 py-4">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-foreground">Enable MCP access</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              When off, every tool is refused, including reading.
            </p>
          </div>
          <StandardSwitch
            checked={mcp.enabled}
            onchange={(e) => setMcp({ enabled: e.currentTarget.checked })}
          />
        </div>

        <div class="flex items-start justify-between gap-6 py-4" class:opacity-50={!mcp.enabled}>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-foreground">Allow changes</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Creating and updating tasks and sprints. Reading works without this.
            </p>
          </div>
          <StandardSwitch
            checked={mcp.allowWrite}
            disabled={!mcp.enabled}
            onchange={(e) => setMcp({ allowWrite: e.currentTarget.checked })}
          />
        </div>

        <div class="flex items-start justify-between gap-6 py-4" class:opacity-50={!mcp.enabled || !mcp.allowWrite}>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-foreground">Allow deleting</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Deleting tasks and sprints. Every delete backs up the previous data first.
            </p>
          </div>
          <StandardSwitch
            checked={mcp.allowDelete}
            disabled={!mcp.enabled || !mcp.allowWrite}
            onchange={(e) => setMcp({ allowDelete: e.currentTarget.checked })}
          />
        </div>
      </div>

      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Connecting
        </h3>
        <p class="mt-2 text-sm text-muted-foreground">
          Add this to <code class="rounded bg-muted px-1 py-0.5 text-xs">.mcp.json</code>
          in your project, then restart your assistant.
        </p>
        <pre class="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground"><code>{`{
  "mcpServers": {
    "flowstack": {
      "command": "node",
      "args": ["mcp/server.js"]
    }
  }
}`}</code></pre>
        <button type="button" class="btn btn-secondary mt-3" onclick={copyMcpConfig}>
          <Copy size={14} />
          Copy config
        </button>
      </div>

      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Storage
        </h3>
        <dl class="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <div class="flex items-baseline gap-1.5">
            <dt class="text-muted-foreground">Backend</dt>
            <dd class="font-semibold text-foreground">{persistenceInfo().backend}</dd>
          </div>
          <div class="flex items-baseline gap-1.5">
            <dt class="text-muted-foreground">Revision</dt>
            <dd class="font-semibold text-foreground">{persistenceInfo().revision}</dd>
          </div>
        </dl>
        <p class="mt-2 text-xs text-muted-foreground">
          The server reads the same file this app writes. If the backend says
          <code class="rounded bg-muted px-1 py-0.5">localStorage</code>, the data has not
          reached disk yet and the server cannot see it.
        </p>
      </div>
    </div>
  {/if}
</main>

<!-- Status Modal -->
<StatusModal
  bind:open={statusModalOpen}
  mode={statusModalMode}
  status={selectedStatus}
/>

<!-- Tag Modal -->
<TagModal bind:open={tagModalOpen} mode={tagModalMode} tag={selectedTag} />

<!-- Confirm Delete Modal -->
<ConfirmModal
  bind:open={confirmModalOpen}
  title={modalConfig.title}
  message={modalConfig.message}
  confirmText={$_("common.delete")}
  cancelText={$_("common.cancel")}
  variant="danger"
  onConfirm={handleConfirmDelete}
/>
