<script lang="ts">
    import { getContext } from "svelte";
    import { Check } from "$lib/icons";

    let { value, class: className, children } = $props();

    const ctx = getContext("select") as any;
</script>

<button
    type="button"
    class={`relative w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-accent hover:text-accent-foreground flex text-left ${className || ""}`}
    onclick={() => ctx.select(value)}
>
    <!-- We don't track selected value in Root context strictly for display checkmark here unless passed back. 
         For simplicity, we omit the checkmark logic or assumes parent handles visual feedback in Trigger.
         But standard Shadcn shows checkmark. 
         Since we rely on onValueChange, we don't know the current value here easily unless bind:value passed to Root.
         User usage: <Select.Root type="single" onValueChange...>. No bind:value.
         So we'll skip the checkmark for now or just render children.
    -->
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <!-- <Check class="h-4 w-4" /> -->
    </span>
    <span class="truncate">
        {@render children()}
    </span>
</button>
