import { toastStore } from "../toastStore.svelte.js";
import { userStore } from "./users.svelte.js";

const STORAGE_KEY_NAME = "userName";

/** Fallback for an install that has not been linked to a team member. */
let name = $state("Guest User");

export const currentUserStore = {
  /**
   * The display name. A linked team member wins, so renaming that member in
   * the Team view immediately renames the profile - there is only one record.
   */
  get name() {
    const member = userStore.currentMember;
    if (!member) return name;
    return `${member.name || ""} ${member.lastname || ""}`.trim() || name;
  },

  /** The linked member record, or null when the profile is standalone. */
  get member() {
    return userStore.currentMember;
  },

  get email() {
    return userStore.currentMember?.email || "";
  },

  get rol() {
    return userStore.currentMember?.rol || "";
  },

  get color() {
    const member = userStore.currentMember;
    return member ? userStore.colorFor(member) : null;
  },

  hydrate() {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY_NAME);
    if (stored) name = stored;
  },

  setName(newName) {
    // Editing the profile of a linked member edits that member, so the roster
    // and the profile cannot show two different names for one person
    const member = userStore.currentMember;
    if (member) {
      const [first, ...rest] = String(newName).trim().split(/\s+/);
      userStore.update(member.id, { name: first || "", lastname: rest.join(" ") });
      toastStore.success("Profile updated");
      return;
    }

    name = newName;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_NAME, newName);
    }
    toastStore.success("Profile updated");
  },
};
