<script>
  import { Tag, X } from "$lib/icons";
  import { tagStore } from "../stores/index.js";

  let {
    value = $bindable(""),
    placeholder = "Search or create tags...",
  } = $props();

  let allTags = $derived(tagStore.tags);
  let inputValue = $state("");
  let selectedTags = $state([]);
  let showSuggestions = $state(false);
  let inputElement;

  // Parse initial value into selected tags
  $effect(() => {
    if (value) {
      const tagNames = value.split(",").map(t => t.trim()).filter(Boolean);
      selectedTags = tagNames.map(name => {
        const existingTag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase());
        return existingTag || { name, color: "#64748b", isNew: true };
      });
    } else {
      selectedTags = [];
    }
  });

  // Update bound value when selected tags change
  $effect(() => {
    value = selectedTags.map(t => t.name).join(", ");
  });

  // Filter suggestions based on input
  let suggestions = $derived(() => {
    if (!inputValue.trim()) return allTags;

    const search = inputValue.toLowerCase().trim();
    const filtered = allTags.filter(tag =>
      tag.name.toLowerCase().includes(search) &&
      !selectedTags.some(st => st.name.toLowerCase() === tag.name.toLowerCase())
    );

    // If no exact match and input has content, show "create new" option
    const exactMatch = allTags.find(t => t.name.toLowerCase() === search);
    if (!exactMatch && search.length > 0) {
      filtered.push({
        name: search,
        color: "#64748b",
        isNew: true,
      });
    }

    return filtered;
  });

  function selectTag(tag) {
    if (!selectedTags.some(t => t.name.toLowerCase() === tag.name.toLowerCase())) {
      selectedTags = [...selectedTags, tag];
    }
    inputValue = "";
    showSuggestions = false;
    inputElement?.focus();
  }

  function removeTag(tagToRemove) {
    selectedTags = selectedTags.filter(t => t.name !== tagToRemove.name);
  }

  function handleKeydown(e) {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      const search = inputValue.toLowerCase().trim();
      const existingTag = allTags.find(t => t.name.toLowerCase() === search);

      if (existingTag) {
        selectTag(existingTag);
      } else if (suggestions().length > 0) {
        selectTag(suggestions()[0]);
      }
    } else if (e.key === "Backspace" && !inputValue && selectedTags.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      selectedTags = selectedTags.slice(0, -1);
    }
  }
</script>

<div class="relative">
  <!-- Selected tags and input -->
  <div
    class="min-h-[42px] w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all"
  >
    <div class="flex flex-wrap gap-1.5 items-center">
      {#each selectedTags as tag (tag.name)}
        <span
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:shadow-sm"
          style="background-color: {tag.color}15; border-color: {tag.color}40; color: {tag.color}"
        >
          <Tag size={10} />
          {tag.name}
          <button
            type="button"
            class="ml-0.5 hover:bg-black/10 rounded-full p-0.5 transition-colors"
            onclick={() => removeTag(tag)}
          >
            <X size={10} />
          </button>
        </span>
      {/each}

      <input
        bind:this={inputElement}
        bind:value={inputValue}
        type="text"
        class="flex-1 min-w-[120px] bg-transparent border-none outline-none px-1 py-0.5"
        placeholder={selectedTags.length === 0 ? placeholder : ""}
        onfocus={() => (showSuggestions = true)}
        onblur={() => setTimeout(() => (showSuggestions = false), 200)}
        onkeydown={handleKeydown}
      />
    </div>
  </div>

  <!-- Suggestions dropdown -->
  {#if showSuggestions && suggestions().length > 0}
    <div
      class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
    >
      {#each suggestions() as suggestion (suggestion.name)}
        <button
          type="button"
          class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center gap-2 border-b border-border last:border-b-0"
          onclick={() => selectTag(suggestion)}
        >
          {#if suggestion.isNew}
            <span class="text-muted-foreground text-xs">Create:</span>
          {/if}
          <span
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
            style="background-color: {suggestion.color}15; border-color: {suggestion.color}40; color: {suggestion.color}"
          >
            <Tag size={10} />
            {suggestion.name}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
