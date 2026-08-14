<script lang="ts">
  import { ChevronDown, Check } from "$lib/icons";
  import { locale, supportedLocales, setLocale, _ } from "$lib/i18n";

  let open = $state(false);
  let buttonElement: HTMLElement | undefined = $state();

  // Get current locale info
  let currentLocale = $derived(
    supportedLocales.find((l) => l.code === $locale) || supportedLocales[0]
  );

  function handleSelect(code: string) {
    setLocale(code);
    open = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (buttonElement && !buttonElement.contains(event.target as Node)) {
      open = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative" bind:this={buttonElement}>
  <button
    type="button"
    class="titlebar__btn flex items-center gap-1"
    onclick={() => (open = !open)}
    title={$_("titlebar.changeLanguage")}
  >
    <img src={currentLocale.flag} alt={currentLocale.name} class="w-4 h-3 object-cover rounded-sm" />
    <span class="text-xs">{currentLocale.code.toUpperCase()}</span>
    <ChevronDown
      size={12}
      class={open ? "rotate-180" : ""}
      style="transition: transform 0.2s"
    />
  </button>

  {#if open}
    <div
      class="absolute right-0 top-full mt-1 min-w-[140px] rounded-lg border border-border bg-card shadow-lg overflow-hidden z-50"
    >
      {#each supportedLocales as loc}
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
          onclick={() => handleSelect(loc.code)}
        >
          <img src={loc.flag} alt={loc.name} class="w-5 h-4 object-cover rounded-sm" />
          <span class="flex-1 text-left">{loc.name}</span>
          {#if loc.code === $locale}
            <Check size={14} class="text-primary" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
