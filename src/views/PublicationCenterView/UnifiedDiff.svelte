<!-- src/views/PublicationCenterView/UnifiedDiff.svelte -->
<script lang="ts">
	import * as Diff from "diff";
	import { computeUnifiedRows } from "./diffRows";

	export let changes: Diff.Change[];

	$: rows = computeUnifiedRows(changes, 3);
</script>

<div class="dg-pc-unified">
	{#each rows as row}
		{#if row.type === "gap"}
			<div class="dg-pc-gap">
				⋯ {row.hiddenCount} unchanged {row.hiddenCount === 1
					? "line"
					: "lines"}
			</div>
		{:else}
			<div
				class="dg-pc-uline"
				class:dg-diff-add={row.type === "add"}
				class:dg-diff-del={row.type === "del"}
			>
				<span class="dg-pc-ln"
					>{row.type === "add" ? "" : row.oldLineNo}</span
				>
				<span class="dg-pc-ln"
					>{row.type === "del" ? "" : row.newLineNo}</span
				>
				<span class="dg-pc-sign" aria-hidden="true"
					>{row.type === "add"
						? "+"
						: row.type === "del"
						? "−"
						: " "}</span
				>
				<span class="dg-pc-text"
					>{#if row.type !== "context"}<span class="dg-sr-only"
							>{row.type === "add"
								? "Added: "
								: "Removed: "}</span
						>{/if}{row.text}</span
				>
			</div>
		{/if}
	{/each}
</div>

<style>
	.dg-pc-unified {
		font-family: var(--font-monospace);
		font-size: var(--font-smaller);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.dg-pc-uline {
		display: grid;
		grid-template-columns: 3.5em 3.5em 1em 1fr;
		gap: 4px;
	}

	.dg-pc-ln,
	.dg-pc-sign {
		color: var(--text-muted);
		text-align: right;
		user-select: none;
	}

	.dg-pc-gap {
		color: var(--text-muted);
		text-align: center;
		padding: 2px 0;
		background: var(--background-secondary);
		font-size: var(--font-ui-smaller);
	}

	@container (max-width: 640px) {
		.dg-pc-uline {
			grid-template-columns: 2.5em 2.5em 1em 1fr;
		}
	}
</style>
