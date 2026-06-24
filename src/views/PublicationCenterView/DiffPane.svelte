<!-- src/views/PublicationCenterView/DiffPane.svelte -->
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import * as Diff from "diff";
	import Icon from "../../ui/Icon.svelte";
	import { FileStatus } from "./annotate";
	import UnifiedDiff from "./UnifiedDiff.svelte";
	import SplitDiff from "./SplitDiff.svelte";

	type DiffData =
		| { kind: "diff"; changes: Diff.Change[] }
		| { kind: "nochange" }
		| { kind: "image" }
		| { kind: "error"; message: string };

	export let path: string | null;
	export let status: FileStatus | null;
	export let data: DiffData | null;
	export let loading: boolean;
	export let mode: "split" | "unified";

	const dispatch = createEventDispatcher();
</script>

{#if !path}
	<div class="dg-pc-diff-empty">
		Select a file from the left to see what changed.
	</div>
{:else}
	<div class="dg-pc-diff-header">
		<span class="dg-pc-diff-path">
			<Icon name="file-diff" />
			{path}
		</span>
		<span class="dg-pc-diff-actions">
			<span class="dg-pc-toggle">
				<button class:active={mode === "split"} on:click={() => dispatch("setMode", { mode: "split" })}>Split</button>
				<button class:active={mode === "unified"} on:click={() => dispatch("setMode", { mode: "unified" })}>Unified</button>
			</span>
			{#if status !== "deleted"}
				<button class="dg-pc-open" on:click={() => dispatch("open", { path })}>Open note</button>
			{/if}
		</span>
	</div>

	<div class="dg-pc-diff-body">
		{#if loading}
			<div class="dg-pc-diff-msg">Loading diff…</div>
		{:else if !data}
			<div class="dg-pc-diff-msg">No diff available.</div>
		{:else if data.kind === "error"}
			<div class="dg-pc-diff-msg">Could not load diff: {data.message}</div>
		{:else if data.kind === "image"}
			<div class="dg-pc-diff-msg">This image will be deleted on publish.</div>
		{:else if data.kind === "nochange"}
			<div class="dg-pc-diff-msg">No changes — local and published versions match.</div>
		{:else if mode === "split"}
			<SplitDiff changes={data.changes} />
		{:else}
			<UnifiedDiff changes={data.changes} />
		{/if}
	</div>
{/if}

<style>
	.dg-pc-diff-empty,
	.dg-pc-diff-msg {
		color: var(--text-muted);
		padding: 16px;
	}

	.dg-pc-diff-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-bottom: 8px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		position: sticky;
		top: 0;
		background: var(--background-primary);
	}

	.dg-pc-diff-path {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-monospace);
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dg-pc-diff-actions {
		display: inline-flex;
		gap: 8px;
		flex: 0 0 auto;
	}

	.dg-pc-toggle button {
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		padding: 2px 8px;
		cursor: pointer;
	}

	.dg-pc-toggle button.active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.dg-pc-toggle button:first-child {
		border-radius: 4px 0 0 4px;
	}

	.dg-pc-toggle button:last-child {
		border-radius: 0 4px 4px 0;
	}
</style>
