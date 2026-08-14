<script>
  /**
   * Placeholder block used while data loads.
   *
   * Deliberately matches the shape of what replaces it - a task card skeleton is
   * card-sized, a row skeleton is row-sized - so the layout does not jump when
   * the real content arrives.
   *
   * @type {{ variant?: "text"|"title"|"card"|"row"|"chip"|"stat", width?: string, class?: string }}
   */
  let { variant = "text", width = "", class: className = "" } = $props();

  const SHAPES = {
    text: "h-3 rounded",
    title: "h-5 rounded",
    chip: "h-4 w-14 rounded-full",
    stat: "h-7 w-16 rounded",
    row: "h-12 rounded-lg",
    card: "h-24 rounded-xl",
  };
</script>

<div
  class="animate-pulse bg-muted {SHAPES[variant] ?? SHAPES.text} {className}"
  style={width ? `width: ${width}` : ""}
  aria-hidden="true"
></div>
