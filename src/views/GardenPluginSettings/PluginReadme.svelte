<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { App, Component, MarkdownRenderer } from "obsidian";
	import type { GardenPluginManager } from "../../gardenPlugins/GardenPluginManager";

	export let app: App;
	export let manager: GardenPluginManager;
	/** GitHub repo as owner/name. */
	export let repo: string;

	let container: HTMLElement;
	let loading = true;
	let missing = false;
	const component = new Component();

	onMount(async () => {
		component.load();
		const markdown = await manager.fetchReadme(repo);
		loading = false;

		if (!markdown) {
			missing = true;

			return;
		}

		await MarkdownRenderer.render(app, markdown, container, "", component);
	});

	onDestroy(() => component.unload());
</script>

{#if loading}
	<p class="dg-readme-status">
		<span class="dg-spinner" aria-hidden="true"></span>
		Loading README…
	</p>
{:else if missing}
	<p class="dg-readme-status">
		This plugin has no README. See
		<a href={`https://github.com/${repo}`}>{repo}</a> on GitHub.
	</p>
{/if}

<div class="dg-readme markdown-rendered" bind:this={container}></div>

<style>
	.dg-readme-status {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
	}

	.dg-readme :global(img) {
		max-width: 100%;
	}

	.dg-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: dg-spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes dg-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dg-spinner {
			animation-duration: 2.5s;
		}
	}
</style>
