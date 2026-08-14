<script>
  import { Plus, Heading, User, Mail, Briefcase, Palette } from "$lib/icons";
  import Modal from "../Modal.svelte";
  import Select from "../Select.svelte";
  import { userStore } from "../stores/index.js";
  import { MEMBER_COLORS } from "../stores/users.svelte.js";

  let {
    open = $bindable(false),
    mode = "create",
    user = null,
  } = $props();

  let formData = $state({
    id: "",
    name: "",
    lastname: "",
    email: "",
    rol: "",
    color: MEMBER_COLORS[0],
  });

  // Select component options
  const roleOptions = [
    { value: "", label: "Select a role" },
    { value: "Developer", label: "Developer" },
    { value: "Designer", label: "Designer" },
    { value: "Product Manager", label: "Product Manager" },
    { value: "QA Engineer", label: "QA Engineer" },
    { value: "DevOps Engineer", label: "DevOps Engineer" },
    { value: "Scrum Master", label: "Scrum Master" },
    { value: "Team Lead", label: "Team Lead" },
  ];

  // Initialize form when modal opens or user changes
  $effect(() => {
    if (open) {
      if (mode === "edit" && user) {
        formData = {
          id: user.id,
          name: user.name || "",
          lastname: user.lastname || "",
          email: user.email || "",
          rol: user.rol || "",
          color: userStore.colorFor(user),
        };
      } else {
        formData = {
          id: "",
          name: "",
          lastname: "",
          email: "",
          rol: "",
          color: MEMBER_COLORS[userStore.users.length % MEMBER_COLORS.length],
        };
      }
    }
  });

  function handleSubmit(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Name is required");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      lastname: formData.lastname.trim(),
      email: formData.email.trim(),
      rol: formData.rol.trim(),
      color: formData.color,
    };

    if (mode === "edit" && formData.id) {
      userStore.update(formData.id, payload);
    } else {
      userStore.create(payload);
    }

    closeModal();
  }

  function closeModal() {
    open = false;
  }
</script>

{#snippet modalChildren()}
  <form id="user-form" class="flex flex-col gap-4" onsubmit={handleSubmit}>
    <div class="grid gap-4 md:grid-cols-2">
      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <User size={14} class="text-muted-foreground" />
          First Name
        </div>
        <input
          class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="John"
          bind:value={formData.name}
          required
        />
      </label>

      <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="flex items-center gap-2 mb-1">
          <User size={14} class="text-muted-foreground" />
          Last Name
        </div>
        <input
          class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Doe"
          bind:value={formData.lastname}
        />
      </label>
    </div>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Mail size={14} class="text-muted-foreground" />
        Email
      </div>
      <input
        type="email"
        class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="john.doe@example.com"
        bind:value={formData.email}
      />
    </label>

    <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="flex items-center gap-2 mb-1">
        <Briefcase size={14} class="text-muted-foreground" />
        Role
      </div>
      <div class="mt-2">
        <Select
          bind:value={formData.rol}
          options={roleOptions}
          placeholder="Select a role"
        />
      </div>
    </label>

    <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div class="mb-1 flex items-center gap-2">
        <Palette size={14} class="text-muted-foreground" />
        Colour
      </div>
      <div class="mt-2 flex items-center gap-3">
        <span
          class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style="background-color: {formData.color}"
        >
          {(formData.name || "?").charAt(0).toUpperCase()}{(formData.lastname || "")
            .charAt(0)
            .toUpperCase()}
        </span>
        <div class="flex flex-wrap gap-2">
          {#each MEMBER_COLORS as swatch}
            <button
              type="button"
              onclick={() => (formData.color = swatch)}
              class="h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all {formData.color ===
              swatch
                ? 'ring-2 ring-primary'
                : ''}"
              style="background-color: {swatch}"
              aria-label={swatch}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  </form>
{/snippet}

{#snippet modalFooter()}
  <div class="flex items-center justify-end gap-2">
    <button type="button" class="btn btn-secondary" onclick={closeModal}>
      Cancel
    </button>
    <button type="submit" form="user-form" class="btn btn-primary">
      <Plus size={16} />
      {mode === "edit" ? "Save Changes" : "Add Member"}
    </button>
  </div>
{/snippet}

<Modal
  {open}
  title={mode === "edit" ? "Edit Team Member" : "Add Team Member"}
  onClose={closeModal}
  children={modalChildren}
  footer={modalFooter}
/>
