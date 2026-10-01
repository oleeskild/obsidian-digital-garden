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
			<div class="dg-pc-gap">⋯ {row.hiddenCount} unchanged lines</div>
		{:else}
			<div class="dg-pc-uline dg-pc-{row.type}">
				<span class="dg-pc-ln"
					>{row.type === "add" ? "" : row.oldLineNo}</span
				>
				<span class="dg-pc-ln"
					>{row.type === "del" ? "" : row.newLineNo}</span
				>
				<span class="dg-pc-sign"
					>{row.type === "add"
						? "+"
						: row.type === "del"
						? "-"
						: " "}</span
				>
				<span class="dg-pc-text">{row.text}</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.dg-pc-unified {
		font-family: var(--font-monospace);
		font-size: var(--font-smaller, 0.85rem);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.dg-pc-uline {
		display: grid;
		grid-template-columns: 3.5em 3.5em 1em 1fr;
		gap: 4px;
	}

	.dg-pc-add {
		background: var(--background-modifier-success);
	}

	.dg-pc-del {
		background: var(--background-modifier-error);
	}

	.dg-pc-ln {
		color: var(--text-faint);
		text-align: right;
		user-select: none;
	}

	.dg-pc-sign {
		user-select: none;
	}

	.dg-pc-gap {
		color: var(--text-faint);
		text-align: center;
		padding: 2px 0;
		background: var(--background-secondary);
		font-size: 0.8rem;
	}
</style>
