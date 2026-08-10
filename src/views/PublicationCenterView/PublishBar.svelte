<!-- src/views/PublicationCenterView/PublishBar.svelte -->
<script lang="ts">
	import { createEventDispatcher } from "svelte";

	export let selectedCount: number;
	export let publishing: boolean;
	export let refreshing: boolean;
	export let showFullRefresh: boolean;

	const dispatch = createEventDispatcher();
</script>

<div class="dg-pc-bar">
	<button
		class="dg-pc-refresh"
		on:click={() => dispatch("refresh")}
		disabled={publishing || refreshing}
	>
		Refresh
	</button>
	{#if showFullRefresh}
		<button
			class="dg-pc-full-refresh"
			on:click={() => dispatch("fullrefresh")}
			disabled={publishing || refreshing}
			title="Discard the local manifest and reread all published files"
		>
			Full refresh
		</button>
	{/if}
	<button
		class="dg-pc-publish"
		on:click={() => dispatch("publish")}
		disabled={publishing || selectedCount === 0}
	>
		{publishing ? "Publishing…" : `Publish ${selectedCount} selected`}
	</button>
</div>

<style>
	.dg-pc-bar {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 8px;
		border-top: 1px solid var(--background-modifier-border);
	}

	.dg-pc-publish {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-weight: bold;
		cursor: pointer;
	}

	.dg-pc-publish:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
