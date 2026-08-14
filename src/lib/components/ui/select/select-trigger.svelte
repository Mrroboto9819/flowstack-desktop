<script lang="ts">
    import { getContext } from "svelte";
    import { ChevronDown } from "$lib/icons";

    let { class: className, children, ...rest } = $props();

    const ctx = getContext("select") as any;
</script>

<button
    type="button"
    class={`flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
    onclick={() => ctx.toggle()}
    {...rest}
>
    {@render children()}
    <ChevronDown class="h-4 w-4 opacity-50" />
</button>
