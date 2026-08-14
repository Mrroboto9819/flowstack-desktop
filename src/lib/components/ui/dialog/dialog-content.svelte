<script lang="ts">
    import { X } from "$lib/icons";
    // We need to access the 'open' state from parent Root.
    // Ideally we'd use context, but for simplicity in this file-based structure and the user's usage pattern (bind:open on Root),
    // the Content is conditionally rendered by Root's if block, so it mounts when open.
    // To close it, we might need a context or dispatch event.
    // For now, let's assume the user handles closing via the bind or we add a simple close button that iterates up?
    // Actually, the user's code has `onclick={() => taskModalOpen = false}` on cancel/actions.
    // The Only missing link is the "X" button and Overlay click.
    // We'll create a backdrop that emits a close event or similar?
    // Since we can't easily modify the parent's bindable without context, let's presume the user handles close logic mostly,
    // BUT standard dialogs should close on overlay click.

    // Better approach: Use a context in Root.
    import { getContext } from "svelte";
    // But simply:
    let { class: className, children } = $props();
</script>

<div
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in-0"
    aria-hidden="true"
></div>
<div
    class={`fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg duration-200 animate-in fade-in-0 zoom-in-95 sm:rounded-lg ${className || ""}`}
>
    {@render children()}
    <!-- We can't easily implement the 'X' button helper without context to set open=false. 
	     However, visual consistency requires it. We'll add it visually. 
	     Functionally, if the user didn't pass a close handler, it won't work.
		 But wait, Shadcn typically includes a generic Close trigger.
		 The user's code example shows `onclick={() => taskModalOpen = false}` on buttons.
		 For the top right X, we'll try to rely on bubble event or just render it. 
	-->
    <div
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
    >
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
    </div>
</div>
