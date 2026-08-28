<script lang="ts">
	import { onMount } from "svelte";
	import { Notice } from "obsidian";
	import type {
		GardenPluginManager,
		RemoteGardenPlugin,
	} from "../../gardenPlugins/GardenPluginManager";
	import type {
		GardenPluginRegistryEntry,
		InstalledGardenPlugin,
	} from "../../models/gardenPlugin";
	import type DigitalGardenSettings from "../../models/settings";
	import { getRegionConflicts, regionsOf } from "../../gardenPlugins/regions";
	import { buildTriggeredNotice } from "../../gardenPlugins/notices";

	export let manager: GardenPluginManager;
	export let settings: DigitalGardenSettings;
	export let close: () => void;

	let input = "";
	let inputEl: HTMLInputElement;
	let inspecting = false;
	let installing = false;
	let error: string | null = null;
	let pending: RemoteGardenPlugin | null = null;
	let existingEntry: GardenPluginRegistryEntry | undefined;
	let conflicts: InstalledGardenPlugin[] = [];
	let disableConflicts = true;

	onMount(() => {
		inputEl?.focus();
	});

	async function inspect() {
		if (!input.trim()) {
			return;
		}

		inspecting = true;
		error = null;
		pending = null;
		disableConflicts = true;

		try {
			const remote = await manager.inspectRemotePlugin(input);
			const installed = await manager.listInstalled();

			existingEntry = installed.find(
				(plugin) => plugin.manifest.id === remote.manifest.id,
			)?.registryEntry;
			conflicts = getRegionConflicts(remote.manifest, installed);
			pending = remote;
		} catch (err) {
			error = err instanceof Error ? err.message : "Unknown error";
		}

		inspecting = false;
	}

	async function confirmInstall() {
		if (!pending) {
			return;
		}

		installing = true;

		const disableIds = disableConflicts
			? conflicts.map((conflict) => conflict.manifest.id)
			: [];

		try {
			await manager.install(pending, existingEntry, disableIds);

			new Notice(
				`${existingEntry ? "Updated" : "Installed"} ${
					pending.manifest.name
				} ${pending.manifest.version}. ${buildTriggeredNotice(
					settings,
				)}`,
			);
			close();
		} catch (err) {
			error = err instanceof Error ? err.message : "Install failed";
			installing = false;
		}
	}
</script>

<div class="dg-install-plugin">
	<p class="dg-install-intro">
		Paste the GitHub URL of a garden plugin. It will be reviewed before
		anything is written to your garden repository.
	</p>

	<form class="dg-install-row" on:submit|preventDefault={inspect}>
		<input
			type="text"
			placeholder="https://github.com/user/garden-plugin-example"
			bind:value={input}
			bind:this={inputEl}
			disabled={inspecting || installing}
		/>

		<button
			type="submit"
			class="mod-cta"
			disabled={inspecting || installing || !input.trim()}
		>
			{#if inspecting}
				<span class="dg-spinner" aria-hidden="true"></span> Checking…
			{:else}
				Check plugin
			{/if}
		</button>
	</form>

	{#if error}
		<p class="dg-install-error">{error}</p>
	{/if}

	{#if pending}
		<div class="dg-install-confirm">
			<p class="dg-install-confirm-title">
				{existingEntry ? "Update" : "Install"}
				<strong>{pending.manifest.name}</strong>
				v{pending.manifest.version} by {pending.manifest.author}?
			</p>

			<p>{pending.manifest.description}</p>

			<p class="dg-install-warning">
				⚠️ Plugins run their own code in your site's build and in your
				visitors' browsers. Only install plugins from authors you trust
				— review the code at
				<a href={`https://github.com/${pending.owner}/${pending.repo}`}
					>{pending.owner}/{pending.repo}</a
				>
				({pending.files.length} files, ref
				<code>{pending.ref}</code>).
			</p>

			{#if conflicts.length > 0}
				<label class="dg-install-conflict-choice">
					<input type="checkbox" bind:checked={disableConflicts} />
					<span>
						{pending.manifest.name} replaces
						<strong
							>{conflicts
								.map((c) => c.manifest.name)
								.join(", ")}</strong
						>
						({regionsOf(pending.manifest).join(", ")}). Disable {conflicts.length ===
						1
							? "it"
							: "them"} so {pending.manifest.name} takes over right
						away.
					</span>
				</label>
			{/if}

			<div class="dg-install-actions">
				<button
					class="mod-cta"
					disabled={installing}
					on:click={confirmInstall}
				>
					{#if installing}
						<span class="dg-spinner" aria-hidden="true"></span>
						Installing…
					{:else}
						{existingEntry ? "Update plugin" : "Install plugin"}
					{/if}
				</button>

				<button disabled={installing} on:click={() => (pending = null)}
					>Cancel</button
				>
			</div>
		</div>
	{/if}
</div>

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

	.dg-install-confirm {
		border: 1px solid var(--background-modifier-border);
		border-left: 3px solid var(--interactive-accent);
		border-radius: 8px;
		padding: 10px 14px;
	}

	.dg-install-confirm-title {
		margin-top: 0;
	}

	.dg-install-warning {
		color: var(--text-warning, var(--text-muted));
	}

	.dg-install-conflict-choice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 10px;
		font-size: 0.92em;
	}

	.dg-install-conflict-choice input {
		margin-top: 3px;
	}

	.dg-install-actions {
		display: flex;
		gap: 8px;
	}

	.dg-install-actions button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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
