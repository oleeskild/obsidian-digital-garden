<script lang="ts">
	import * as Diff from "diff";
	export let diff: Diff.Change[];
</script>

<div>
	<div class="info callout">
		Differences between your local file and the published file.
		<br />
		The content may look a bit different from your note. This is because it shows
		the note after being processed by the plugin.
	</div>
	<hr />
	{#if diff}
		<div>
			{#each diff as part}
				{#if part.added}
					<pre
						style="display: block; background-color: rgba(170, 255, 170, 0.5); color: var(--text-on-accent)">{part.value}</pre>
				{:else if part.removed}
					<pre
						style="display: block; background-color: rgba(255, 170, 170, 0.5); color: var(--text-on-accent)">{part.value}</pre>
				{:else}
					<pre>{part.value}</pre>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	pre {
		display: block;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
