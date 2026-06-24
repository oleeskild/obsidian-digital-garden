<script lang="ts">
	import Icon from "../../ui/Icon.svelte";

	const TUTORIAL_KEY = "dg-pc-tutorial-dismissed";
	// eslint-disable-next-line no-undef
	let show = !localStorage.getItem(TUTORIAL_KEY);

	function dismiss() {
		show = false;
		// eslint-disable-next-line no-undef
		localStorage.setItem(TUTORIAL_KEY, "true");
	}
</script>

{#if show}
	<div class="dg-pc-tutorial">
		<div class="dg-pc-tutorial-header">
			<div class="dg-pc-tutorial-title">
				👋 Welcome to the Publication Center
			</div>
			<button
				class="dg-pc-tutorial-close"
				on:click={dismiss}
				aria-label="Dismiss tutorial"
			>
				<Icon name="x" />
			</button>
		</div>
		<ul class="dg-pc-tutorial-list">
			<li>
				The left column lists your notes, each with a status dot:
				<span class="dg-pc-tut-dot dg-pc-dot-new" /> new,
				<span class="dg-pc-tut-dot dg-pc-dot-changed" /> changed,
				<span class="dg-pc-tut-dot dg-pc-dot-deleted" /> deleted,
				<span class="dg-pc-tut-dot dg-pc-dot-published" /> published.
			</li>
			<li>
				Use the filter chips at the top to focus on the statuses you
				care about.
			</li>
			<li>
				Click a file to see its changes, and switch between
				<strong>Split</strong> and <strong>Unified</strong> diff views.
			</li>
			<li>
				Tick the files you want, then press
				<strong>Publish selected</strong>.
			</li>
		</ul>
		<div class="dg-pc-tutorial-actions">
			<button class="dg-pc-tutorial-got" on:click={dismiss}>Got it</button
			>
		</div>
	</div>
{/if}

<style>
	.dg-pc-tutorial {
		border: 1px solid var(--interactive-accent);
		border-radius: 6px;
		padding: 12px;
		margin-bottom: 10px;
		background: var(--background-secondary);
	}

	.dg-pc-tutorial-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.dg-pc-tutorial-title {
		font-weight: bold;
		font-size: 1.05rem;
	}

	.dg-pc-tutorial-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.dg-pc-tutorial-close:hover {
		color: var(--text-normal);
	}

	.dg-pc-tutorial-list {
		margin: 8px 0 4px;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dg-pc-tut-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		vertical-align: middle;
	}

	.dg-pc-dot-new {
		background: var(--text-success, green);
	}

	.dg-pc-dot-changed {
		background: var(--text-warning, orange);
	}

	.dg-pc-dot-deleted {
		background: var(--text-error, red);
	}

	.dg-pc-dot-published {
		background: var(--text-muted);
	}

	.dg-pc-tutorial-actions {
		display: flex;
		justify-content: flex-end;
	}

	.dg-pc-tutorial-got {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		cursor: pointer;
		font-weight: bold;
	}
</style>
