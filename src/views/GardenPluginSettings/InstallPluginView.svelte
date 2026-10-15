<script lang="ts">
	import { onMount, tick } from "svelte";
	import { Notice } from "obsidian";
	import type { GardenPluginManager } from "../../gardenPlugins/GardenPluginManager";
	import type DigitalGardenSettings from "../../models/settings";
	import {
		installFromRepo,
		installNotice,
	} from "../../gardenPlugins/installPlugin";
	import CommunityPluginsGate from "./CommunityPluginsGate.svelte";

	export let manager: GardenPluginManager;
	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let close: () => void;

	let communityEnabled = settings.gardenCommunityPluginsEnabled === true;
	let input = "";
	let inputEl: HTMLInputElement;
	let installing = false;
	let error: string | null = null;

	onMount(() => {
		inputEl?.focus();
	});

	async function onEnabled() {
		communityEnabled = true;
		await tick();
		inputEl?.focus();
	}

	async function install() {
		if (!input.trim()) {
			return;
		}

		installing = true;
		error = null;

		try {
			const installed = await manager.listInstalled();
			const result = await installFromRepo(manager, input, installed);

			new Notice(installNotice(result, settings));
			close();
		} catch (err) {
			error = err instanceof Error ? err.message : "Install failed";
			installing = false;
		}
	}
</script>

{#if !communityEnabled}
	<CommunityPluginsGate {settings} {saveSettings} {onEnabled} />
{:else}
	<div class="dg-install-plugin">
		<p class="dg-install-intro">
			Paste the GitHub URL of a garden plugin to install it, or to update
			it if it is already installed.
		</p>

		<form class="dg-install-row" on:submit|preventDefault={install}>
			<input
				type="text"
				placeholder="https://github.com/user/garden-plugin-example"
				bind:value={input}
				bind:this={inputEl}
				disabled={installing}
			/>

			<button
				type="submit"
				class="mod-cta"
				disabled={installing || !input.trim()}
			>
				{#if installing}
					<span class="dg-spinner" aria-hidden="true"></span> Installing…
				{:else}
					Install
				{/if}
			</button>
		</form>

		{#if error}
			<p class="dg-install-error">{error}</p>
		{/if}
	</div>
{/if}

<style>
	.dg-install-plugin {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: min(440px, 80vw);
	}

	.dg-install-intro {
		color: var(--text-muted);
		margin: 0;
	}

	.dg-install-row {
		display: flex;
		gap: 8px;
	}

	.dg-install-row input {
		flex: 1;
	}

	.dg-install-row button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}

	.dg-install-error {
		color: var(--text-error);
		margin: 0;
	}

	.dg-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: dg-spin 0.7s linear infinite;
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
