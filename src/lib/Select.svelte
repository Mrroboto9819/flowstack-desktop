<script lang="ts">
  import { ChevronDown, Check } from "$lib/icons";
  import { clickOutside } from "./clickOutside.js";

  let {
    value = $bindable(""),
    options = [],
    placeholder = "Select an option",
    disabled = false,
    class: className = "",
  } = $props();

  let isOpen = $state(false);
  let selectRef: HTMLDivElement | null = $state(null);
  let buttonRef: HTMLButtonElement | null = $state(null);
  let dropdownPosition = $state({ top: 0, left: 0, width: 0 });

  // Get the selected option label
  let selectedLabel = $derived(
    options.find((opt) => opt.value === value)?.label || placeholder,
  );

  function toggleDropdown() {
    if (!disabled) {
      if (!isOpen && buttonRef) {
        const rect = buttonRef.getBoundingClientRect();
        const maxDropdownHeight = 250;

        let top = rect.bottom + 8;
        let left = rect.left;

        // Check if dropdown would go off bottom of screen
        if (top + maxDropdownHeight > window.innerHeight) {
          top = rect.top - maxDropdownHeight - 8;
        }

        dropdownPosition = {
          top,
          left,
          width: rect.width,
        };
      }
      isOpen = !isOpen;
    }
  }

  function selectOption(optionValue: any, e: MouseEvent) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    value = optionValue;
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (disabled) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleDropdown();
    } else if (e.key === "Escape") {
      isOpen = false;
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        isOpen = true;
      } else {
        // Navigate through options
        const currentIndex = options.findIndex((opt) => opt.value === value);
        let nextIndex;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
        }
        value = options[nextIndex].value;
      }
    }
  }

  function handleClickOutside() {
    isOpen = false;
  }
</script>

<div
  bind:this={selectRef}
  class={className}
  use:clickOutside={handleClickOutside}
>
  <!-- Select Button -->
  <button
    bind:this={buttonRef}
    type="button"
    class={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 ${
      disabled
        ? "cursor-not-allowed opacity-50 bg-muted border-border"
        : isOpen
          ? "border-primary bg-background text-foreground ring-2 ring-primary/20"
          : "border-border bg-background text-foreground hover:border-primary/50"
    }`}
    onclick={toggleDropdown}
    onkeydown={handleKeyDown}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    <span class={value ? "text-foreground" : "text-muted-foreground"}>
      {selectedLabel}
    </span>
    <ChevronDown
      size={16}
      class={`transition-transform duration-200 text-muted-foreground ${isOpen ? "rotate-180" : ""}`}
    />
  </button>

  <!-- Dropdown Menu -->
  {#if isOpen}
    <div
      class="fixed z-[100] rounded-lg border border-border bg-card shadow-lg overflow-hidden"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px;"
      role="listbox"
    >
      <div
        class="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      >
        {#each options as option (option.value)}
          <button
            type="button"
            class={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
              option.value === value
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-muted"
            }`}
            onclick={(e) => selectOption(option.value, e)}
            role="option"
            aria-selected={option.value === value}
          >
            <span>{option.label}</span>
            {#if option.value === value}
              <Check size={16} class="text-primary" />
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
