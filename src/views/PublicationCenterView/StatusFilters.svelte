<!-- src/views/PublicationCenterView/StatusFilters.svelte -->
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import { FileStatus } from "./annotate";

	export let counts: Record<FileStatus, number>;
	export let active: Set<FileStatus>;

	const dispatch = createEventDispatcher();

	const ORDER: { status: FileStatus; label: string }[] = [
		{ status: "changed", label: "Changed" },
		{ status: "new", label: "New" },
		{ status: "deleted", label: "Deleted" },
		{ status: "published", label: "Published" },
	];
</script>

<div class="dg-pc-filters">
	{#each ORDER as { status, label }}
		<button
			class="dg-pc-chip"
			class:active={active.has(status)}
			data-status={status}
			on:click={() => dispatch("toggle", { status })}
		>
			<span class="dg-pc-dot dg-pc-dot-{status}"></span>
			{label}
			<span class="dg-pc-count">{counts[status] ?? 0}</span>
		</button>
	{/each}
</div>

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
		padding: 2px 8px;
		border-radius: 12px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.8rem;
	}

	.dg-pc-chip.active {
		color: var(--text-normal);
		border-color: var(--interactive-accent);
	}

	.dg-pc-count {
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	.dg-pc-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}

	.dg-pc-dot-changed {
		background: var(--text-warning, orange);
	}

	.dg-pc-dot-new {
		background: var(--text-success, green);
	}

	.dg-pc-dot-deleted {
		background: var(--text-error, red);
	}

	.dg-pc-dot-published {
		background: var(--text-muted);
	}
</style>
