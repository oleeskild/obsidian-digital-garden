<!-- src/views/PublicationCenterView/StatusDot.svelte -->
<script lang="ts">
	import type { FileStatus } from "./annotate";

	export let status: FileStatus;
</script>

<span class="dg-pc-dot dg-pc-dot-{status}" aria-hidden="true"></span>

<style>
	.dg-pc-dot {
		display: inline-block;
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dg-pc-dot-changed {
		background: var(--text-warning);
	}

	.dg-pc-dot-new {
		background: var(--text-success);
	}

	.dg-pc-dot-deleted {
		background: var(--text-error);
	}

	/* Light themes: deepen so the dot keeps 3:1 on white, as in Publishes. */
	:global(.theme-light) .dg-pc-dot-changed {
		background: color-mix(in srgb, var(--text-warning) 75%, black);
	}

	:global(.theme-light) .dg-pc-dot-new {
		background: color-mix(in srgb, var(--text-success) 65%, black);
	}

	.dg-pc-dot-published {
		background: var(--text-muted);
	}
</style>
