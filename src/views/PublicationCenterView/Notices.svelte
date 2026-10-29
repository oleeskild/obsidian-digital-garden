<!-- src/views/PublicationCenterView/Notices.svelte -->
<script lang="ts">
	import Icon from "../../ui/Icon.svelte";

	export let problematicFiles: { path: string; issue: string }[] = [];
	/** Another first-run banner is showing; hold the release notes back. */
	export let quiet = false;
	/** Release notes only matter when notes show as changed. */
	export let hasChangedNotes = false;
	/** Nothing has ever been published, so there is nothing to migrate. */
	export let isNewGarden = false;
	/** Forestry.md manages the site template for the user. */
	export let isForestry = false;

	const IMAGE_FIX_NOTICE_KEY = "dg-dismissed-image-fix-notice";
	const BASES_NOTICE_KEY = "dg-dismissed-bases-support-notice";

	// eslint-disable-next-line no-undef
	let showImageFix = !localStorage.getItem(IMAGE_FIX_NOTICE_KEY);
	// eslint-disable-next-line no-undef
	let showBases = !localStorage.getItem(BASES_NOTICE_KEY);

	function dismissImageFix() {
		showImageFix = false;
		// eslint-disable-next-line no-undef
		localStorage.setItem(IMAGE_FIX_NOTICE_KEY, "true");
	}

	function dismissBases() {
		showBases = false;
		// eslint-disable-next-line no-undef
		localStorage.setItem(BASES_NOTICE_KEY, "true");
	}

	// These notes explain why existing published notes show as changed
	// after an upgrade. A garden that starts after these releases never
	// needs them, so retire them for good.
	$: if (isNewGarden) {
		if (showImageFix) dismissImageFix();

		if (showBases) dismissBases();
	}

	// One release note at a time, oldest first.
	$: releaseNote =
		quiet || !hasChangedNotes
			? null
			: showImageFix
			? "imageFix"
			: showBases
			? "bases"
			: null;
</script>

{#if problematicFiles.length > 0}
	<div class="dg-pc-callout dg-pc-warning" role="alert">
		<div class="dg-pc-callout-title">
			<Icon name="alert-triangle" />
			Check before publishing
		</div>
		{#each problematicFiles as file}
			<div class="dg-pc-problem">
				<span class="dg-pc-problem-path">{file.path}</span>
				<span>{file.issue}</span>
			</div>
		{/each}
	</div>
{/if}

{#if releaseNote === "imageFix"}
	<div class="dg-pc-callout dg-pc-info">
		<div class="dg-pc-callout-header">
			<div class="dg-pc-callout-title">Image handling improved</div>
			<button
				class="dg-pc-dismiss clickable-icon"
				on:click={dismissImageFix}
				aria-label="Dismiss"
			>
				<Icon name="x" />
			</button>
		</div>
		<div>
			Images with size parameters (e.g. <code>![[image.png|200]]</code>)
			are now handled differently to fix rendering in tables. This may
			cause notes with images to show as changed. This is expected and
			safe to publish.
		</div>
	</div>
{:else if releaseNote === "bases"}
	<div class="dg-pc-callout dg-pc-info">
		<div class="dg-pc-callout-header">
			<div class="dg-pc-callout-title">Bases support added</div>
			<button
				class="dg-pc-dismiss clickable-icon"
				on:click={dismissBases}
				aria-label="Dismiss"
			>
				<Icon name="x" />
			</button>
		</div>
		<div>
			Frontmatter properties are now nested differently to support
			Obsidian Bases. This may cause notes to show as changed. This is
			expected and safe to publish.
			{#if !isForestry}
				You must update your site template to use Bases.
			{/if}
		</div>
	</div>
{/if}

<style>
	.dg-pc-callout {
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		padding: 10px;
		margin-bottom: 10px;
		font-size: var(--font-ui-small);
	}

	.dg-pc-warning {
		border-color: color-mix(in srgb, var(--text-warning) 45%, transparent);
		background: color-mix(in srgb, var(--text-warning) 10%, transparent);
	}

	.dg-pc-info {
		background: var(--background-secondary);
	}

	.dg-pc-callout-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.dg-pc-callout-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: var(--font-semibold);
		margin-bottom: 6px;
	}

	.dg-pc-warning .dg-pc-callout-title {
		color: var(--text-normal);
	}

	.dg-pc-warning .dg-pc-callout-title :global(.svg-icon) {
		color: var(--text-warning);
	}

	.dg-pc-problem {
		display: flex;
		flex-direction: column;
		margin: 4px 0;
	}

	.dg-pc-problem-path {
		font-family: var(--font-monospace);
		color: var(--text-muted);
	}
</style>
