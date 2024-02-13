<script lang="ts">
	import { getIcon } from "obsidian";
	export let name = ""; //Lucide icon name. See https://lucide.dev/icons
</script>

{@html getIcon(name)?.outerHTML}
