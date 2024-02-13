<script lang="ts">
	import * as Diff from "diff";
	export let diff: Diff.Change[];
</script>

<div>
	{#if diff}
		<div>
			{#each diff as part}
				{#if part.added}
					<span class="added">{part.value}</span>
				{:else if part.removed}
					<span class="removed">{part.value}</span>
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
		background-color: rgba(170, 255, 170, 0.5);
		color: var(--text-on-accent);
		text-decoration: overline;
	}

	.removed {
		background-color: rgba(255, 170, 170, 0.5);
		color: var(--text-on-accent);
		text-decoration: line-through;
	}
</style>
