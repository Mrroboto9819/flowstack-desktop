<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  // /sprint and /sprints were ~70% the same code: both listed sprints, both
  // computed points, both opened the sprint modal - and this page's task
  // create/edit were console.log stubs that did nothing at all.
  //
  // They are one page now. This route only redirects, so any bookmark or
  // in-app link still lands somewhere sensible.
  onMount(() => {
    goto("/sprints", { replaceState: true });
  });
</script>
