<!-- src/views/PublicationCenterView/Tutorial.svelte -->
<script lang="ts" context="module">
	const TUTORIAL_KEY = "dg-pc-tutorial-dismissed";

	/** Whether the tutorial still shows; lets other banners wait their turn. */
	export function isTutorialPending(): boolean {
		// eslint-disable-next-line no-undef
		return !localStorage.getItem(TUTORIAL_KEY);
	}
</script>

<script lang="ts">
	import Icon from "../../ui/Icon.svelte";
	import StatusDot from "./StatusDot.svelte";

	// Bound by the parent so other first-run banners wait their turn.
	export let visible = isTutorialPending();

	function dismiss() {
		visible = false;
		// eslint-disable-next-line no-undef
		localStorage.setItem(TUTORIAL_KEY, "true");
	}
</script>

{#if visible}
	<section class="dg-pc-tutorial" aria-labelledby="dg-pc-tutorial-title">
		<div class="dg-pc-tutorial-header">
			<h2 id="dg-pc-tutorial-title" class="dg-pc-tutorial-title">
				Welcome to the Publication Center
			</h2>
			<button
				class="dg-pc-tutorial-close clickable-icon"
				on:click={dismiss}
				aria-label="Dismiss tutorial"
			>
				<Icon name="x" />
			</button>
		</div>
		<ul class="dg-pc-tutorial-list">
			<li>
				Each note shows its status:
				<span class="dg-pc-legend"><StatusDot status="new" /> New</span
				>,
				<span class="dg-pc-legend"
					><StatusDot status="changed" /> Changed</span
				>,
				<span class="dg-pc-legend"
					><StatusDot status="deleted" /> Removing</span
				>
				(unpublished, or gone from your vault) and
				<span class="dg-pc-legend"
					><StatusDot status="published" /> Published</span
				>.
			</li>
			<li>
				The filter chips show or hide each status. Publishing only
				includes the notes you can see.
			</li>
			<li>Select a note to see what changed since you last published.</li>
			<li>
				Everything that needs publishing starts ticked. Untick what
				should wait, then press <strong>Publish</strong>. You'll be
				asked to confirm before anything is removed from your site.
			</li>
		</ul>
		<div class="dg-pc-tutorial-actions">
			<button on:click={dismiss}>Got it</button>
		</div>
	</section>
{/if}

<style>
	.dg-pc-tutorial {
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		padding: 12px;
		margin-bottom: 10px;
		background: var(--background-secondary);
		font-size: var(--font-ui-small);
	}

	.dg-pc-tutorial-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.dg-pc-tutorial-title {
		margin: 0;
		font-size: var(--font-ui-medium);
		font-weight: var(--font-semibold);
	}

	.dg-pc-tutorial-list {
		margin: 8px 0 4px;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dg-pc-legend {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
	}

	.dg-pc-tutorial-actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
