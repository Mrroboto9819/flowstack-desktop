<script lang="ts">
  import { Heart, Github, Globe, Coffee, ExternalLink } from "lucide-svelte";
  import { _ } from "$lib/i18n";

  // App version from Vite define
  declare const __APP_VERSION__: string;
  const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown";

  async function openLink(url: string) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  }
</script>

<main class="min-h-screen px-4 pt-6 pb-10 sm:px-6">
  <header class="mb-6 border-b border-border pb-5">
    <h1 class="text-2xl font-bold text-foreground sm:text-3xl">{$_("about.title")}</h1>
    <p class="mt-1 text-sm text-muted-foreground">{$_("about.description")}</p>
  </header>

  <div class="max-w-2xl space-y-8">
    <!-- App identity: the icon is the only surface on this page -->
    <section>
      <div class="mb-4 flex items-center gap-4">
        <img src="/app-icon.png" alt="FlowStack" class="h-14 w-14 rounded-2xl" />
        <div>
          <h2 class="text-xl font-bold text-foreground">FlowStack</h2>
          <p class="text-sm text-muted-foreground">v{appVersion}</p>
        </div>
      </div>
      <p class="text-sm leading-relaxed text-muted-foreground">
        {$_("about.appDescription")}
      </p>
    </section>

    <!-- Developer Card -->
    <section class="border-t border-border pt-6">
      <div class="flex items-center gap-3 mb-6">
        <Heart size={20} class="text-rose-500" />
        <h2 class="text-lg font-semibold text-foreground">{$_("about.developer")}</h2>
      </div>

      <div class="flex flex-col sm:flex-row gap-6">
        <div class="flex-1">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-bold text-lg">
              PC
            </div>
            <div>
              <h3 class="text-lg font-semibold text-foreground">Pablo Cabrera</h3>
              <p class="text-sm text-muted-foreground">{$_("about.role")}</p>
            </div>
          </div>

          <div class="space-y-3">
            <button
              type="button"
              onclick={() => openLink("https://pablocabrera.dev/")}
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <Globe size={18} class="text-primary" />
              <span class="flex-1 text-sm text-foreground">pablocabrera.dev</span>
              <ExternalLink size={14} class="text-muted-foreground" />
            </button>

            <button
              type="button"
              onclick={() => openLink("https://github.com/Mrroboto9819")}
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <Github size={18} class="text-foreground" />
              <span class="flex-1 text-sm text-foreground">@Mrroboto9819</span>
              <ExternalLink size={14} class="text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Support Card -->
    <section class="border-t border-border pt-6">
      <div class="flex items-center gap-3 mb-6">
        <Coffee size={20} class="text-amber-500" />
        <h2 class="text-lg font-semibold text-foreground">{$_("about.support")}</h2>
      </div>

      <p class="text-muted-foreground text-sm mb-6">
        {$_("about.supportDescription")}
      </p>

      <div class="flex flex-col sm:flex-row items-center gap-6">
        <div class="p-4 bg-white rounded-2xl shadow-sm">
          <img
            src="/qr-code.png"
            alt="Buy Me a Coffee QR Code"
            class="w-40 h-40"
          />
        </div>
        <div class="text-center sm:text-left">
          <p class="text-sm text-muted-foreground mb-3">
            {$_("about.scanQR")}
          </p>
          <button
            type="button"
            onclick={() => openLink("https://buymeacoffee.com/pablocabre4")}
            class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
          >
            <Coffee size={18} />
            {$_("about.buyMeCoffee")}
          </button>
        </div>
      </div>
    </section>

    <!-- Tech Stack -->
    <section class="border-t border-border pt-6">
      <h2 class="text-lg font-semibold text-foreground mb-4">{$_("about.builtWith")}</h2>
      <div class="flex flex-wrap gap-2">
        {#each ["SvelteKit 5", "Tauri 2.0", "TypeScript", "TailwindCSS", "Chart.js"] as tech}
          <span class="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {tech}
          </span>
        {/each}
      </div>
    </section>

    <!-- Footer -->
    <p class="border-t border-border pt-6 text-sm text-muted-foreground">
      {$_("about.madeWith")} <Heart size={14} class="inline text-rose-500" /> {$_("about.madeWithEnd")}
    </p>
  </div>
</main>
