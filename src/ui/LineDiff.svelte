<script lang="ts">
	import * as Diff from "diff";
	export let diff: Diff.Change[];
</script>

<div>
	{#if diff}
		<div>
			{#each diff as part}
				{#if part.added}
					<span class="added dg-diff-add">{part.value}</span>
				{:else if part.removed}
					<span class="removed dg-diff-del">{part.value}</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	span {
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.added {
		color: var(--text-normal);
		text-decoration: overline;
	}

	.removed {
		color: var(--text-normal);
		text-decoration: line-through;
	}
</style>
