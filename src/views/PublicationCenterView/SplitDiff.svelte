<!-- src/views/PublicationCenterView/SplitDiff.svelte -->
<script lang="ts">
	import * as Diff from "diff";
	import { computeSplitRows } from "./diffRows";
	import type { SplitCell } from "./diffRows";

	export let changes: Diff.Change[];

	$: rows = computeSplitRows(changes);

	const SIGN = { add: "+", del: "−", context: "" } as const;
	const SPOKEN = { add: "Added: ", del: "Removed: ", context: "" } as const;

	const cellClass = (cell?: SplitCell) =>
		!cell
			? "dg-pc-empty"
			: cell.type === "add"
			? "dg-diff-add"
			: cell.type === "del"
			? "dg-diff-del"
			: "";
</script>

<div class="dg-pc-split">
	{#each rows as row}
		<div class="dg-pc-srow">
			{#each [row.left, row.right] as cell}
				<div class="dg-pc-scell {cellClass(cell)}">
					<span class="dg-pc-ln">{cell?.lineNo ?? ""}</span>
					<span class="dg-pc-sign" aria-hidden="true"
						>{cell ? SIGN[cell.type] : ""}</span
					>
					<span class="dg-pc-text"
						>{#if cell && SPOKEN[cell.type]}<span class="dg-sr-only"
								>{SPOKEN[cell.type]}</span
							>{/if}{cell?.text ?? ""}</span
					>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.dg-pc-split {
		font-family: var(--font-monospace);
		font-size: var(--font-smaller);
	}

	.dg-pc-srow {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.dg-pc-scell {
		display: grid;
		grid-template-columns: 3em 1ch 1fr;
		gap: 4px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.dg-pc-empty {
		background: var(--background-secondary);
	}

	.dg-pc-ln,
	.dg-pc-sign {
		color: var(--text-muted);
		text-align: right;
		user-select: none;
	}

	@container (max-width: 640px) {
		.dg-pc-srow {
			gap: 4px;
		}

		.dg-pc-scell {
			grid-template-columns: 2.5em 1ch 1fr;
		}
	}
</style>
