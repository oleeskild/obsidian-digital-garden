<!-- src/views/PublicationCenterView/DiffPane.svelte -->
<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import * as Diff from "diff";
	import { Platform } from "obsidian";
	import Icon from "../../ui/Icon.svelte";
	import StatusDot from "./StatusDot.svelte";
	import type { FileStatus } from "./annotate";
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
	/** What the next publish does, listed while no note is open. */
	export let plan: {
		publish: { path: string; status: FileStatus }[];
		remove: string[];
		site: string[];
	} = { publish: [], remove: [], site: [] };

	/** Why a file is being removed ("unpublished", …); null otherwise. */
	export let removal: string | null = null;

	const dispatch = createEventDispatcher();

	$: isImage = data?.kind === "image";
	$: removalText =
		removal === "unpublished"
			? "This note is no longer marked for publishing, so it will be removed from your site. Untick it to keep it there for now."
			: removal === "no longer used"
			? "No published note uses this image anymore, so it will be removed from your site."
			: `This ${
					isImage ? "image" : "note"
			  } is no longer in your vault, so it will be removed from your site.`;
	// One side is empty, so split would leave half the pane blank.
	$: oneSided = status === "deleted" || status === "new";
	$: canOpen = status !== "deleted" || removal === "unpublished";

	// Past this, a group says "and N more"; the tree has the rest.
	const MAX_ITEMS = 8;

	const splitPath = (p: string) => {
		const i = p.lastIndexOf("/");

		return { folder: i < 0 ? "" : p.slice(0, i + 1), name: p.slice(i + 1) };
	};

	$: planTotal = plan.publish.length + plan.remove.length + plan.site.length;
	$: noteGroups = [
		{ id: "publish", title: "Publish", items: plan.publish },
		{
			id: "remove",
			title: "Remove from your site",
			items: plan.remove.map((p) => ({
				path: p,
				status: "deleted" as FileStatus,
			})),
		},
	].filter((g) => g.items.length > 0);
	$: pathParts = path ? splitPath(path) : null;
</script>

{#if !path}
	<div class="dg-pc-plan">
		{#if planTotal === 0}
			<p class="dg-pc-plan-none">
				Nothing selected. Tick notes on the left to publish them.
			</p>
		{:else}
			<h3 class="dg-pc-plan-title">This publish</h3>
			{#each noteGroups as group (group.id)}
				<section
					class="dg-pc-plan-group"
					aria-labelledby="dg-pc-plan-{group.id}"
				>
					<h4 id="dg-pc-plan-{group.id}" class="dg-pc-plan-heading">
						{group.title}
						<span class="dg-pc-plan-count"
							>{group.items.length}</span
						>
					</h4>
					<ul class="dg-pc-plan-list">
						{#each group.items.slice(0, MAX_ITEMS) as item (item.path)}
							{@const parts = splitPath(item.path)}
							<li>
								<button
									class="dg-pc-plan-item"
									class:is-removing={group.id === "remove"}
									title={item.path}
									on:click={() =>
										dispatch("select", { path: item.path })}
								>
									<StatusDot status={item.status} />
									<span class="dg-pc-plan-name"
										><span class="dg-pc-plan-folder"
											>{parts.folder}</span
										>{parts.name}</span
									>
								</button>
							</li>
						{/each}
					</ul>
					{#if group.items.length > MAX_ITEMS}
						<p class="dg-pc-plan-more">
							and {group.items.length - MAX_ITEMS} more
						</p>
					{/if}
				</section>
			{/each}
			{#if plan.site.length > 0}
				<section
					class="dg-pc-plan-group"
					aria-labelledby="dg-pc-plan-site"
				>
					<h4 id="dg-pc-plan-site" class="dg-pc-plan-heading">
						Site settings
						<span class="dg-pc-plan-count">{plan.site.length}</span>
					</h4>
					<ul class="dg-pc-plan-list">
						{#each plan.site.slice(0, MAX_ITEMS) as label}
							<li>
								<button
									class="dg-pc-plan-item"
									on:click={() => dispatch("site")}
								>
									<Icon name="settings" />
									<span class="dg-pc-plan-name">{label}</span>
								</button>
							</li>
						{/each}
					</ul>
					{#if plan.site.length > MAX_ITEMS}
						<p class="dg-pc-plan-more">
							and {plan.site.length - MAX_ITEMS} more
						</p>
					{/if}
				</section>
			{/if}
			{#if noteGroups.length > 0}
				<p class="dg-pc-plan-foot">
					Select a note to see what changed.
				</p>
			{/if}
		{/if}
	</div>
{:else}
	<div class="dg-pc-diff-header">
		<span class="dg-pc-diff-path" title={path}>
			<Icon name="file-diff" />
			<span class="dg-pc-diff-name"
				>{#if pathParts?.folder}<span class="dg-pc-plan-folder"
						>{pathParts.folder}</span
					>{/if}{pathParts?.name}</span
			>
		</span>
		<span class="dg-pc-diff-actions">
			<!-- Side by side can't fit a phone; unified only there. -->
			{#if !Platform.isPhone && !oneSided && !isImage}
				<span
					class="dg-pc-toggle"
					role="group"
					aria-label="Diff layout"
				>
					<button
						class:active={mode === "split"}
						aria-pressed={mode === "split"}
						on:click={() => dispatch("setMode", { mode: "split" })}
						>Split</button
					>
					<button
						class:active={mode === "unified"}
						aria-pressed={mode === "unified"}
						on:click={() =>
							dispatch("setMode", { mode: "unified" })}
						>Unified</button
					>
				</span>
			{/if}
			{#if canOpen}
				<button
					class="dg-pc-open"
					on:click={() => dispatch("open", { path })}
					>Open note</button
				>
			{/if}
			<button
				class="clickable-icon"
				aria-label="Close diff"
				on:click={() => dispatch("close")}
			>
				<Icon name="x" />
			</button>
		</span>
	</div>

	<div class="dg-pc-diff-body">
		{#if status === "deleted" && !loading}
			<p class="dg-pc-diff-note">{removalText}</p>
		{/if}
		{#if loading}
			<div class="dg-pc-diff-msg">Loading diff…</div>
		{:else if !data}
			<div class="dg-pc-diff-msg">No diff available.</div>
		{:else if data.kind === "error"}
			<div class="dg-pc-diff-msg">
				Couldn't load the published version: {data.message}
			</div>
		{:else if data.kind === "image"}
			<!-- Said above. -->
		{:else if data.kind === "nochange" && status === "deleted"}
			<div class="dg-pc-diff-msg">The published version is empty.</div>
		{:else if data.kind === "nochange"}
			<div class="dg-pc-diff-msg">
				No changes — local and published versions match.
			</div>
		{:else if mode === "split" && !oneSided}
			<SplitDiff changes={data.changes} />
		{:else}
			<UnifiedDiff changes={data.changes} />
		{/if}
	</div>
{/if}

<style>
	.dg-pc-diff-msg {
		color: var(--text-muted);
		padding: 16px;
	}

	.dg-pc-diff-note {
		margin: 0 0 8px;
		padding: 0 8px;
		font-size: var(--font-ui-small);
	}

	.dg-pc-plan {
		max-width: 40rem;
		padding: 12px 16px 16px;
		font-size: var(--font-ui-small);
	}

	.dg-pc-plan-none,
	.dg-pc-plan-foot {
		margin: 0;
		color: var(--text-muted);
	}

	.dg-pc-plan-foot {
		margin-top: 16px;
	}

	.dg-pc-plan-title {
		margin: 0 0 12px;
		font-size: var(--font-ui-medium);
		font-weight: var(--font-semibold);
	}

	.dg-pc-plan-group + .dg-pc-plan-group {
		margin-top: 16px;
	}

	.dg-pc-plan-heading {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 4px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
	}

	.dg-pc-plan-count {
		font-weight: normal;
		font-variant-numeric: tabular-nums;
	}

	.dg-pc-plan-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.dg-pc-plan-item {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		width: calc(100% + 12px);
		height: auto;
		min-height: 24px;
		padding: 3px 6px;
		margin-inline: -6px;
		background: none;
		border: none;
		box-shadow: none;
		border-radius: var(--radius-s);
		color: var(--text-normal);
		font-size: inherit;
		text-align: left;
		cursor: pointer;
	}

	@media (hover: hover) {
		.dg-pc-plan-item:hover {
			background: var(--background-modifier-hover);
		}
	}

	.dg-pc-plan-item :global(.svg-icon) {
		width: 14px;
		height: 14px;
		color: var(--text-muted);
	}

	.dg-pc-plan-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dg-pc-plan-item.is-removing .dg-pc-plan-name {
		text-decoration: line-through;
		text-decoration-color: var(--text-error);
	}

	.dg-pc-plan-folder {
		color: var(--text-muted);
	}

	.dg-pc-plan-more {
		margin: 2px 0 0;
		color: var(--text-muted);
	}

	.dg-pc-diff-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		position: sticky;
		top: 0;
		background: var(--background-primary);
	}

	.dg-pc-diff-body {
		padding: 0 8px 8px;
	}

	.dg-pc-diff-path {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
		font-size: var(--font-ui-small);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dg-pc-diff-name {
		min-width: 0;
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

	/* The pressed segment reads as raised, in normal ink: an accent fill
	   with white text falls below 4.5:1 on several themes. */
	.dg-pc-toggle button.active {
		background: var(--background-primary);
		color: var(--text-normal);
		font-weight: var(--font-semibold);
		border-color: var(--background-modifier-border-hover);
	}

	.dg-pc-toggle button:first-child {
		border-radius: var(--radius-s) 0 0 var(--radius-s);
	}

	.dg-pc-toggle button:last-child {
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
	}

	@container (max-width: 640px) {
		.dg-pc-diff-header {
			flex-wrap: wrap;
		}

		.dg-pc-diff-path {
			flex: 1 1 100%;
		}
	}
</style>
