<script>
  import { AlertCircle } from "$lib/icons";

  let {
    label = "",
    error = "",
    required = false,
    hint = "",
    children,
  } = $props();
