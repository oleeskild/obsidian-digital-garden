<!-- src/views/PublicationCenterView/SplitDiff.svelte -->
<script lang="ts">
	import * as Diff from "diff";
	import { computeSplitRows } from "./diffRows";

	export let changes: Diff.Change[];

	$: rows = computeSplitRows(changes);
</script>

<div class="dg-pc-split">
	{#each rows as row}
		<div class="dg-pc-srow">
			<div class="dg-pc-scell dg-pc-{row.left?.type ?? 'empty'}">
				<span class="dg-pc-ln">{row.left?.lineNo ?? ""}</span>
				<span class="dg-pc-text">{row.left?.text ?? ""}</span>
			</div>
			<div class="dg-pc-scell dg-pc-{row.right?.type ?? 'empty'}">
				<span class="dg-pc-ln">{row.right?.lineNo ?? ""}</span>
				<span class="dg-pc-text">{row.right?.text ?? ""}</span>
			</div>
		</div>
	{/each}
</div>

<style>
	.dg-pc-split {
		font-family: var(--font-monospace);
		font-size: var(--font-smaller, 0.85rem);
	}

	.dg-pc-srow {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.dg-pc-scell {
		display: grid;
		grid-template-columns: 3.5em 1fr;
		gap: 4px;
		white-space: pre-wrap;
		word-break: break-word;
		border-left: 2px solid transparent;
	}

	.dg-pc-add {
		background: var(--background-modifier-success);
	}

	.dg-pc-del {
		background: var(--background-modifier-error);
	}

	.dg-pc-empty {
		background: var(--background-secondary);
	}

	.dg-pc-ln {
		color: var(--text-faint);
		text-align: right;
		user-select: none;
	}
</style>
