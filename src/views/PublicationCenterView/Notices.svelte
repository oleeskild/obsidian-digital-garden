<!-- src/views/PublicationCenterView/Notices.svelte -->
<script lang="ts">
	import Icon from "../../ui/Icon.svelte";

	export let problematicFiles: { path: string; issue: string }[] = [];

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
</script>

{#if problematicFiles.length > 0}
	<div class="dg-pc-callout dg-pc-warning">
		<div class="dg-pc-callout-title">⚠️ Issues found</div>
		{#each problematicFiles as file}
			<div class="dg-pc-problem">
				<span class="dg-pc-problem-path">{file.path}</span>
				<span>{file.issue}</span>
			</div>
		{/each}
	</div>
{/if}

{#if showImageFix}
	<div class="dg-pc-callout dg-pc-info">
		<div class="dg-pc-callout-header">
			<div class="dg-pc-callout-title">Image handling improved</div>
			<button class="dg-pc-dismiss" on:click={dismissImageFix} aria-label="Dismiss">
				<Icon name="x" />
			</button>
		</div>
		<div>
			Images with size parameters (e.g. <code>![[image.png|200]]</code>) are now
			handled differently to fix rendering in tables. This may cause notes with
			images to show as changed. This is expected and safe to publish.
		</div>
	</div>
{/if}

{#if showBases}
	<div class="dg-pc-callout dg-pc-info">
		<div class="dg-pc-callout-header">
			<div class="dg-pc-callout-title">Bases support added</div>
			<button class="dg-pc-dismiss" on:click={dismissBases} aria-label="Dismiss">
				<Icon name="x" />
			</button>
		</div>
		<div>
			Frontmatter properties are now nested differently to support Obsidian
			Bases. This may cause notes to show as changed. This is expected and safe
			to publish. You must update your site template to use Bases.
		</div>
	</div>
{/if}

<style>
	.dg-pc-callout {
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		padding: 10px;
		margin-bottom: 10px;
		font-size: 0.85rem;
	}

	.dg-pc-warning {
		background: var(--background-modifier-error-hover, rgba(255, 150, 0, 0.1));
	}

	.dg-pc-info {
		background: var(--background-secondary);
	}

	.dg-pc-callout-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.dg-pc-callout-title {
		font-weight: bold;
		margin-bottom: 6px;
	}

	.dg-pc-dismiss {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 2px;
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
