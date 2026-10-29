<!-- src/views/PublicationCenterView/PublishBar.svelte -->
<script lang="ts">
	import { createEventDispatcher, tick } from "svelte";
	import { Platform } from "obsidian";
	import Icon from "../../ui/Icon.svelte";
	import { siteHref } from "../../forestry/buildStatus";
	import {
		describeRemovals,
		publishButtonDescription,
		publishButtonLabel,
	} from "./publishSummary";
	import type { PublishSummary } from "./publishSummary";

	export let summary: PublishSummary;
	/** Selected files the status filters currently hide; they won't ship. */
	export let hiddenSelectedCount = 0;
	/** Why some site changes are held back, if any are. */
	export let siteHeldReason: string | null = null;
	/** Worth knowing before publishing, e.g. a build is already running. */
	export let notice: string | null = null;
	export let publishing: boolean;
	/** Why publishing can't run right now (e.g. the publish branch is missing). */
	export let blockedReason: string | null = null;
	/** Steps done so far; `known` is false until the real total is in. */
	export let progress: {
		known: boolean;
		done: number;
		total: number;
		current: string;
	} | null = null;
	/** What the last publish did, said where it was asked for. */
	export let result: string | null = null;
	/** The site's address, for "View site" after a publish. */
	export let siteUrl: string | null = null;
	/** A publish error is showing above; the bar points to it. */
	export let failed = false;
	/** Why a file is being removed, e.g. "unpublished". */
	export let removalReason: (path: string) => string = () => "";
	/** A large removal as a share of the site, e.g. "That's 40 of your 52…". */
	export let removalShare: string | null = null;

	const dispatch = createEventDispatcher();

	// Unique per instance; more than one Publication Center can be open.
	const confirmId = `dg-pc-confirm-${Math.random().toString(36).slice(2)}`;

	let confirming = false;
	let cancelButton: HTMLButtonElement;
	// The confirm opens where Publish was clicked; a second click that
	// lands this soon is the same impatient double-click, not a decision.
	const ARM_DELAY_MS = 400;
	let confirmOpenedAt = 0;

	$: nothingSelected =
		summary.publishCount + summary.removeCount + summary.siteCount === 0;
	$: disabled = publishing || blockedReason !== null || nothingSelected;

	// The selection changed under an open confirmation: start over.
	$: if (summary) confirming = false;

	$: hint = blockedReason
		? blockedReason
		: failed && !publishing
		? "Couldn't publish. The details are above."
		: hiddenSelectedCount > 0
		? `${hiddenSelectedCount} selected ${
				hiddenSelectedCount === 1 ? "file is" : "files are"
		  } hidden by the filters and won't be published.`
		: siteHeldReason
		? siteHeldReason
		: notice && !nothingSelected && !publishing
		? notice
		: nothingSelected && !publishing
		? "Select the notes you want to publish."
		: // Phones get no plan summary beside the tree, so the bar says
		// what "Publish 5 · Remove 2 · Site 1" means.
		Platform.isPhone && !publishing
		? `${publishButtonDescription(summary)}.`
		: "";

	$: showHiddenAction =
		!blockedReason && !(failed && !publishing) && hiddenSelectedCount > 0;

	async function requestPublish() {
		if (summary.removeCount === 0) {
			dispatch("publish");

			return;
		}
		confirming = true;
		confirmOpenedAt = Date.now();
		await tick();
		cancelButton?.focus();
	}

	function confirm() {
		if (Date.now() - confirmOpenedAt < ARM_DELAY_MS) return;
		confirming = false;
		dispatch("publish");
	}

	function onConfirmKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			confirming = false;
		}
	}
</script>

{#if confirming}
	<div
		class="dg-pc-bar dg-pc-confirm"
		role="alertdialog"
		tabindex="-1"
		aria-labelledby="{confirmId}-title"
		aria-describedby="{confirmId}-body"
		on:keydown={onConfirmKeydown}
	>
		<div class="dg-pc-confirm-text">
			<div id="{confirmId}-title" class="dg-pc-confirm-title">
				Remove {summary.removeCount}
				{summary.removeCount === 1 ? "file" : "files"} from your live site?
			</div>
			<div id="{confirmId}-body" class="dg-pc-bar-hint">
				{describeRemovals(summary.removePaths, removalReason)}. Visitors
				won't see {summary.removeCount === 1 ? "it" : "them"} anymore.
			</div>
			{#if removalShare}
				<div class="dg-pc-confirm-share">{removalShare}</div>
				<details class="dg-pc-confirm-review">
					<summary>Review list</summary>
					<ul>
						{#each summary.removePaths as path (path)}
							<li>{path} <span>{removalReason(path)}</span></li>
						{/each}
					</ul>
				</details>
			{/if}
		</div>
		<!-- Cancel takes the spot where Publish was clicked. -->
		<div class="dg-pc-bar-actions">
			<button class="mod-warning" on:click={confirm}>
				{summary.publishCount > 0
					? "Publish and remove"
					: `Remove ${summary.removeCount}`}
			</button>
			<button
				bind:this={cancelButton}
				on:click={() => (confirming = false)}
			>
				Cancel
			</button>
		</div>
	</div>
{:else}
	<div class="dg-pc-bar">
		{#if publishing && progress}
			<div class="dg-pc-bar-progress" role="status">
				<div class="dg-pc-bar-progress-text">
					{#if progress.known}
						Publishing… {progress.done} of {progress.total} files
					{:else}
						Publishing…
					{/if}
					{#if progress.current}
						<span class="dg-pc-bar-progress-step"
							>{progress.current}</span
						>
					{/if}
				</div>
				<progress
					max={progress.known && progress.total ? progress.total : 1}
					value={progress.known && progress.total ? progress.done : 0}
				></progress>
			</div>
		{:else if result}
			<div class="dg-pc-bar-result" role="status">
				<Icon name="check-circle" />
				<span
					>{result}
					{#if siteUrl}
						<a class="dg-pc-bar-link" href={siteHref(siteUrl)}
							>View site</a
						>
					{/if}</span
				>
				<button
					class="clickable-icon"
					aria-label="Dismiss"
					on:click={() => dispatch("dismissResult")}
				>
					<Icon name="x" />
				</button>
			</div>
		{:else}
			<div
				class="dg-pc-bar-hint"
				class:is-error={failed && !publishing && !blockedReason}
				aria-live="polite"
			>
				{#if failed && !publishing && !blockedReason}<Icon
						name="alert-circle"
					/>{/if}
				{hint}
				{#if showHiddenAction}
					<button
						class="dg-pc-bar-show"
						on:click={() => dispatch("showHidden")}
						>Show them</button
					>
				{/if}
			</div>
		{/if}
		<div class="dg-pc-bar-actions">
			<button on:click={() => dispatch("refresh")} disabled={publishing}>
				Refresh
			</button>
			<!-- The name is the visible label (WCAG 2.5.3); the full sentence
			     is its description. -->
			<button
				class="mod-cta dg-pc-publish"
				on:click={requestPublish}
				{disabled}
				aria-describedby="{confirmId}-desc"
			>
				{publishing ? "Publishing…" : publishButtonLabel(summary)}
			</button>
			<span id="{confirmId}-desc" class="dg-sr-only"
				>{publishing ? "" : publishButtonDescription(summary)}</span
			>
		</div>
	</div>
{/if}

<style>
	.dg-pc-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 8px 12px;
		border-top: 1px solid var(--background-modifier-border);
	}

	.dg-pc-bar-hint {
		flex: 1 1 12rem;
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-pc-bar-progress,
	.dg-pc-bar-result {
		flex: 1 1 14rem;
		min-width: 0;
		font-size: var(--font-ui-small);
	}

	.dg-pc-bar-progress-text {
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
		font-variant-numeric: tabular-nums;
	}

	.dg-pc-bar-progress-step {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-pc-bar-progress progress {
		display: block;
		width: 100%;
		height: 4px;
		margin-top: 6px;
	}

	.dg-pc-bar-result {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-normal);
	}

	.dg-pc-bar-result > span {
		flex: 1;
	}

	/* A centred 44px tap area for the small dismiss. */
	:global(.is-mobile) .dg-pc-bar-result .clickable-icon {
		position: relative;
	}

	:global(.is-mobile) .dg-pc-bar-result .clickable-icon::after {
		content: "";
		position: absolute;
		left: 50%;
		top: 50%;
		width: 44px;
		height: 44px;
		transform: translate(-50%, -50%);
	}

	.dg-pc-bar-result > :global(.svg-icon) {
		flex: 0 0 auto;
		color: var(--text-success);
	}

	/* Obsidian's light-theme green is too pale for a small icon; deepen
	   it to 3:1, like the status dots. */
	:global(.theme-light) .dg-pc-bar-result > :global(.svg-icon) {
		color: color-mix(in srgb, var(--text-success) 65%, black);
	}

	.dg-pc-bar-actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	/* Normal ink so the small text stays readable; the icon carries the
	   error tone. */
	.dg-pc-bar-hint.is-error {
		color: var(--text-normal);
	}

	.dg-pc-bar-hint.is-error :global(.svg-icon) {
		width: 14px;
		height: 14px;
		margin-right: 4px;
		vertical-align: -2px;
		color: var(--text-error);
	}

	/* Link-styled inline actions, in the hint's own size. */
	.dg-pc-bar-show {
		display: inline;
		height: auto;
		padding: 0;
		background: none;
		border: none;
		box-shadow: none;
		color: var(--text-normal);
		font-size: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	/* A centred 44px tap area for the small link-button. */
	:global(.is-mobile) .dg-pc-bar-show {
		position: relative;
	}

	:global(.is-mobile) .dg-pc-bar-show::after {
		content: "";
		position: absolute;
		left: 50%;
		top: 50%;
		width: max(100%, 44px);
		height: 44px;
		transform: translate(-50%, -50%);
	}

	.dg-pc-bar-link {
		margin-left: 4px;
		white-space: nowrap;
	}

	.dg-pc-confirm-text {
		flex: 1 1 16rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.dg-pc-confirm-text .dg-pc-bar-hint {
		flex: none;
	}

	.dg-pc-confirm-title {
		font-weight: var(--font-semibold);
	}

	.dg-pc-confirm-share {
		font-size: var(--font-ui-small);
		font-weight: var(--font-semibold);
	}

	.dg-pc-confirm-review {
		font-size: var(--font-ui-smaller);
	}

	.dg-pc-confirm-review summary {
		width: fit-content;
		color: var(--text-normal);
		text-decoration: underline;
		cursor: pointer;
	}

	.dg-pc-confirm-review ul {
		max-height: 10rem;
		overflow: auto;
		margin: 4px 0 0;
		padding-left: 1.2em;
	}

	.dg-pc-confirm-review li span {
		color: var(--text-muted);
	}

	:global(.is-mobile) .dg-pc-confirm-review summary {
		padding-block: 12px;
	}

	.dg-pc-publish {
		font-variant-numeric: tabular-nums;
	}

	@container (max-width: 640px) {
		/* The phone gutter, so text doesn't run to the screen edge. */
		.dg-pc-bar {
			padding: 8px var(--size-4-4);
		}

		.dg-pc-bar-actions {
			flex: 1 1 100%;
		}

		/* The main button: Publish, or the confirm's remove. */
		.dg-pc-bar-actions > button:last-of-type {
			flex: 1 1 auto;
		}
	}
</style>
