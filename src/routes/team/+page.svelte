<script>
  import {
    Plus,
    Pencil,
    Trash2,
    Mail,
    Briefcase,
    Users2,
    UserCheck,
    User,
    Users,
  } from "$lib/icons";
  import { userStore, taskStore } from "../../lib/stores/index.js";
  import UserModal from "../../lib/components/UserModal.svelte";
  import ConfirmModal from "../../lib/components/ConfirmModal.svelte";
  import { _ } from "$lib/i18n";
  import Skeleton from "../../lib/components/Skeleton.svelte";
  import { appState } from "../../lib/stores/app.svelte.js";

  let users = $derived(userStore.users);
  // The roster is deliberately global: people work across projects, so scoping
  // this view would hide colleagues rather than clarify anything. Membership is
  // still recorded on each person (projectIds) for reporting.
  let allTasks = $derived(taskStore.tasks);

  // Modal state
  let userModalOpen = $state(false);
  let userModalMode = $state("create");
  let selectedUser = $state(null);

  // Confirm modal state
  let confirmModalOpen = $state(false);
  let userToDelete = $state(null);

  // Get task count for user
  function getUserTaskCount(userName) {
    const fullName = userName.trim();
    return allTasks.filter((task) => task.asign === fullName).length;
  }

  // Get active tasks for user
  function getUserActiveTasks(userName) {
    const fullName = userName.trim();
    return allTasks.filter(
      (task) =>
        task.asign === fullName &&
        task.status !== "DONE" &&
        task.status !== "COMPLETE",
    ).length;
  }

  // Group users by role
  let usersByRole = $derived(() => {
    const grouped = {};
    users.forEach((user) => {
      const role = user.rol || "Unassigned";
      if (!grouped[role]) {
        grouped[role] = [];
      }
      grouped[role].push(user);
    });
    return grouped;
  });

  // User modal functions
  function openUserModal() {
    userModalMode = "create";
    selectedUser = null;
    userModalOpen = true;
  }

  function editUser(user) {
    userModalMode = "edit";
    selectedUser = user;
    userModalOpen = true;
  }

  function confirmDeleteUser(user) {
    userToDelete = user;
    confirmModalOpen = true;
  }

  function handleConfirmDelete() {
    if (userToDelete) {
      userStore.delete(userToDelete.id);
      userToDelete = null;
    }
  }

  // Get initials
  function getInitials(name, lastname) {
    const firstInitial = name?.charAt(0).toUpperCase() || "?";
    const lastInitial = lastname?.charAt(0).toUpperCase() || "";
    return firstInitial + lastInitial;
  }

  // Get role color
  const roleColors = {
    Developer: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-500",
    },
    Designer: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
      text: "text-purple-500",
    },
    "Product Manager": {
      bg: "bg-primary/10",
      border: "border-primary/30",
      text: "text-primary",
    },
    "QA Engineer": {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-500",
    },
    "DevOps Engineer": {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-500",
    },
    "Scrum Master": {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-500",
    },
    "Team Lead": {
      bg: "bg-pink-500/10",
      border: "border-pink-500/30",
      text: "text-pink-500",
    },
  };

  function getRoleColor(role) {
    return (
      roleColors[role] || {
        bg: "bg-muted",
        border: "border-border",
        text: "text-muted-foreground",
      }
    );
  }
</script>

<main class="min-h-screen px-4 pt-6 pb-10 sm:px-6">
  <!-- Header -->
  <header class="mb-6 border-b border-border pb-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("team.title")}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {$_("team.description")}
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        onclick={openUserModal}
      >
        <Plus size={16} />
        {$_("team.addMember")}
      </button>
    </div>

    <!-- Figures inline instead of three boxes inside a panel -->
    {#if users.length > 0}
      <dl class="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <div class="flex items-baseline gap-1.5">
          <dd class="font-semibold text-foreground">{users.length}</dd>
          <dt class="text-muted-foreground">{$_("team.totalMembers")}</dt>
        </div>
        <div class="flex items-baseline gap-1.5">
          <dd class="font-semibold text-foreground">{Object.keys(usersByRole()).length}</dd>
          <dt class="text-muted-foreground">{$_("team.roles")}</dt>
        </div>
        <div class="flex items-baseline gap-1.5">
          <dd class="font-semibold text-foreground">
            {users.filter(
              (u) => getUserTaskCount(`${u.name} ${u.lastname || ""}`) > 0,
            ).length}
          </dd>
          <dt class="text-muted-foreground">{$_("team.withTasks")}</dt>
        </div>
      </dl>
    {/if}
  </header>

  <div class="space-y-6">
    <!-- Team Members List -->
    {#if !appState.ready}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each Array(3) as _}
          <div class="rounded-xl border border-border bg-card p-4">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted"></div>
              <div class="min-w-0 flex-1">
                <Skeleton variant="title" width="70%" />
                <div class="mt-2"><Skeleton width="45%" /></div>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-3">
              <Skeleton variant="stat" />
              <Skeleton variant="stat" />
            </div>
          </div>
        {/each}
      </div>
    {:else if users.length === 0}
      <div class="py-16 text-center">
        <Users2
          size={48}
          class="mx-auto mb-4 text-muted-foreground opacity-50"
        />
        <h3 class="text-lg font-semibold text-foreground mb-2">
          {$_("team.noTeamMembers")}
        </h3>
        <p class="text-sm text-muted-foreground mb-4">
          {$_("team.addMemberDesc")}
        </p>
        <button type="button" class="btn btn-primary" onclick={openUserModal}>
          <Plus size={16} />
          {$_("team.addFirstMember")}
        </button>
      </div>
    {:else}
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {$_("team.teamMembers")}
          </h2>
          <p class="text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? $_("team.member") : $_("team.members")}
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {#each users as user (user.id)}
            {@const fullName = `${user.name} ${user.lastname || ""}`.trim()}
            {@const taskCount = getUserTaskCount(fullName)}
            {@const activeTasks = getUserActiveTasks(fullName)}
            {@const roleColor = getRoleColor(user.rol)}

            <!-- The member is the only surface on this page -->
            <article
              class="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <div class="flex items-start justify-between gap-3 mb-4">
                <!-- Avatar and Info -->
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                    style="background-color: {userStore.colorFor(user)}"
                  >
                    {getInitials(user.name, user.lastname)}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="text-base font-bold text-foreground truncate">
                      {user.name}
                      {user.lastname || ""}
                    </h3>
                    {#if user.email}
                      <p
                        class="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5"
                      >
                        <Mail size={10} />
                        {user.email}
                      </p>
                    {/if}
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    class="btn btn-ghost px-2 py-1 text-[10px]"
                    onclick={() => editUser(user)}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-500 hover:text-white"
                    onclick={() => confirmDeleteUser(user)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <!-- Role Badge -->
              {#if user.rol}
                <div class="mb-3">
                  <span
                    class={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${roleColor.bg} ${roleColor.border} ${roleColor.text}`}
                  >
                    <Briefcase size={10} />
                    {user.rol}
                  </span>
                </div>
              {/if}

              <!-- Task Stats -->
              <div class="grid grid-cols-2 gap-2 pt-3 border-t border-border">
                <div>
                  <p class="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {$_("team.totalTasks")}
                  </p>
                  <p class="mt-1 text-lg font-bold text-foreground">
                    {taskCount}
                  </p>
                </div>
                <div>
                  <p class="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {$_("team.active")}
                  </p>
                  <p class="mt-1 text-lg font-bold text-primary">
                    {activeTasks}
                  </p>
                </div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</main>

<!-- User Modal -->
<UserModal bind:open={userModalOpen} mode={userModalMode} user={selectedUser} />

<!-- Confirm Delete Modal -->
<ConfirmModal
  bind:open={confirmModalOpen}
  title={$_("team.removeMember")}
  message={userToDelete
    ? $_("team.removeMemberMessage", { values: { name: `${userToDelete.name} ${userToDelete.lastname || ""}` } })
    : $_("confirmModal.defaultMessage")}
  confirmText={$_("team.remove")}
  cancelText={$_("common.cancel")}
  variant="danger"
  onConfirm={handleConfirmDelete}
/>
