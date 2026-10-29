<!-- src/views/PublicationCenterView/StatusFilters.svelte -->
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import StatusDot from "./StatusDot.svelte";
	import { STATUS_LABEL } from "./annotate";
	import type { FileStatus } from "./annotate";

	export let counts: Record<FileStatus, number>;
	export let active: Set<FileStatus>;
	/** Ticked notes a hidden status keeps out of the publish. */
	export let heldOut: Partial<Record<FileStatus, number>> = {};

	const dispatch = createEventDispatcher();

	const ORDER: FileStatus[] = ["changed", "new", "deleted", "published"];

	// A status with nothing in it has nothing to filter.
	$: shown = ORDER.filter((status) => (counts[status] ?? 0) > 0);
</script>

{#if shown.length > 0}
	<div class="dg-pc-filters" role="group" aria-label="Show notes by status">
		{#each shown as status}
			<button
				class="dg-pc-chip"
				class:active={active.has(status)}
				aria-pressed={active.has(status)}
				data-status={status}
				on:click={() => dispatch("toggle", { status })}
			>
				<StatusDot {status} />
				{STATUS_LABEL[status]}
				<span class="dg-pc-count">{counts[status] ?? 0}</span>
				{#if (heldOut[status] ?? 0) > 0}
					<span class="dg-pc-held">· not in this publish</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.dg-pc-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.dg-pc-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: auto;
		padding: 2px 10px;
		border-radius: 999px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		box-shadow: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: var(--font-ui-smaller);
	}

	:global(.is-mobile) .dg-pc-chip {
		position: relative;
		padding: 6px 12px;
	}

	/* A 44px tall tap area without taller chips. */
	:global(.is-mobile) .dg-pc-chip::after {
		content: "";
		position: absolute;
		inset-inline: 0;
		top: 50%;
		height: 44px;
		transform: translateY(-50%);
	}

	:global(.is-mobile) .dg-pc-filters {
		row-gap: 12px;
	}

	@media (hover: hover) {
		.dg-pc-chip:hover {
			color: var(--text-normal);
		}
	}

	.dg-pc-chip.active {
		color: var(--text-normal);
		border-color: var(--interactive-accent);
	}

	/* Normal ink on a muted, switched-off chip, so the effect stands out. */
	.dg-pc-held {
		color: var(--text-normal);
	}

	/* Side by side but narrow: tighter chips, so all four fit one line. */
	@container (min-width: 641px) and (max-width: 900px) {
		.dg-pc-filters {
			gap: 4px;
		}

		.dg-pc-chip {
			gap: 4px;
			padding-inline: 7px;
		}
	}

	.dg-pc-count {
		font-variant-numeric: tabular-nums;
	}
</style>
