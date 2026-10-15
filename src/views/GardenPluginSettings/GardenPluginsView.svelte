<script lang="ts">
	import { onMount } from "svelte";
	import { App, Notice } from "obsidian";
	import type { GardenPluginManager } from "../../gardenPlugins/GardenPluginManager";
	import type {
		CommunityGardenPlugin,
		GardenPluginSettingEntry,
		InstalledGardenPlugin,
	} from "../../models/gardenPlugin";
	import type DigitalGardenSettings from "../../models/settings";
	import { getRegionProviders, regionsOf } from "../../gardenPlugins/regions";
	import { buildTriggeredNotice } from "../../gardenPlugins/notices";
	import {
		installFromRepo,
		installNotice,
	} from "../../gardenPlugins/installPlugin";
	import CommunityPluginsGate from "./CommunityPluginsGate.svelte";
	import PluginReadme from "./PluginReadme.svelte";
	import { PublishBranchMissingError } from "../../repositoryConnection/PublishBranchMissingError";
	import { notifyPublishBranchMissing } from "../../repositoryConnection/publishBranchNotice";

	export let app: App;
	export let manager: GardenPluginManager;
	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let applyNoteSettingsToSite: () => Promise<void>;

	let loading = true;
	let loadError: string | null = null;
	let installed: InstalledGardenPlugin[] = [];
	let community: CommunityGardenPlugin[] = [];
	let communityFilter = "";
	let communityLoading = true;
	let busy = false;

	let communityEnabled = settings.gardenCommunityPluginsEnabled === true;
	let installInput = "";
	let installError: string | null = null;
	/** Repo (owner/name or URL) currently being installed or updated. */
	let installingRepo: string | null = null;
	let selected: CommunityGardenPlugin | null = null;
	let expandedSettingsId: string | null = null;
	let settingsDraft: Record<string, string | number | boolean> = {};
	let activeTab: "installed" | "browse" = "installed";

	onMount(async () => {
		await refresh();
		community = await manager.fetchCommunityPlugins();
		selected = community[0] ?? null;
		communityLoading = false;
	});

	async function refresh() {
		loading = true;
		loadError = null;

		try {
			installed = await manager.listInstalled();
		} catch (error) {
			loadError =
				error instanceof Error
					? error.message
					: "Could not read plugins from your garden repository";
		}

		loading = false;
	}

	function installedIds(): Set<string> {
		return new Set(installed.map((plugin) => plugin.manifest.id));
	}

	async function move(plugin: InstalledGardenPlugin, delta: -1 | 1) {
		const ids = installed.map((p) => p.manifest.id);
		const from = ids.indexOf(plugin.manifest.id);
		const to = from + delta;

		if (from < 0 || to < 0 || to >= ids.length) return;

		ids.splice(from, 1);
		ids.splice(to, 0, plugin.manifest.id);

		busy = true;

		try {
			await manager.setOrder(ids);

			new Notice(
				`${plugin.manifest.name} moved ${
					delta < 0 ? "up" : "down"
				}. ${buildTriggeredNotice(settings)}`,
			);
			await refresh();
		} catch (error) {
			new Notice(
				error instanceof Error
					? error.message
					: "Could not save the plugin order",
			);
		} finally {
			busy = false;
		}
	}

	async function toggleEnabled(plugin: InstalledGardenPlugin) {
		busy = true;

		try {
			await manager.setEnabled(plugin.manifest.id, !plugin.enabled);

			new Notice(
				`${plugin.manifest.name} ${
					plugin.enabled ? "disabled" : "enabled"
				}. ${buildTriggeredNotice(settings)}`,
			);
			await refresh();
		} catch (error) {
			new Notice(
				`Could not ${plugin.enabled ? "disable" : "enable"} ${
					plugin.manifest.name
				}: ${error instanceof Error ? error.message : "unknown error"}`,
			);
		}

		busy = false;
	}

	function openSettings(plugin: InstalledGardenPlugin) {
		if (expandedSettingsId === plugin.manifest.id) {
			expandedSettingsId = null;

			return;
		}

		expandedSettingsId = plugin.manifest.id;
		settingsDraft = {};

		for (const entry of plugin.manifest.settings ?? []) {
			const stored = plugin.registryEntry?.settings?.[entry.key];
			settingsDraft[entry.key] = stored ?? entry.default ?? "";
		}
	}

	function coerce(entry: GardenPluginSettingEntry, value: string) {
		if (entry.type === "number") {
			return Number(value);
		}

		return value;
	}

	async function saveDraft(plugin: InstalledGardenPlugin) {
		busy = true;

		try {
			await manager.savePluginSettings(plugin.manifest.id, settingsDraft);

			new Notice(
				`Saved settings for ${
					plugin.manifest.name
				}. ${buildTriggeredNotice(settings)}`,
			);
			expandedSettingsId = null;
			await refresh();
		} catch (error) {
			if (error instanceof PublishBranchMissingError) {
				notifyPublishBranchMissing(error);
			} else {
				new Notice(
					`Could not save settings for ${plugin.manifest.name}`,
				);
			}
		}

		busy = false;
	}

	function noteSettingKeysFor(plugin: InstalledGardenPlugin): string[] {
		return (plugin.manifest.noteSettings ?? []).filter(
			(key) => key in settings.defaultNoteSettings,
		);
	}

	async function toggleNoteSetting(key: string) {
		const noteSettings = settings.defaultNoteSettings as Record<
			string,
			boolean
		>;
		noteSettings[key] = !noteSettings[key];
		await saveSettings();
		await applyNoteSettingsToSite();
		installed = installed;
	}

	/**
	 * Install or update straight away — the third-party code warning was
	 * accepted once when community plugins were turned on.
	 */
	async function install(repoInput: string): Promise<boolean> {
		busy = true;
		installingRepo = repoInput;
		installError = null;

		try {
			const result = await installFromRepo(manager, repoInput, installed);

			new Notice(installNotice(result, settings));
			await refresh();

			return true;
		} catch (error) {
			if (error instanceof PublishBranchMissingError) {
				notifyPublishBranchMissing(error);
			} else {
				installError =
					error instanceof Error ? error.message : "Install failed";
				new Notice(installError);
			}

			return false;
		} finally {
			busy = false;
			installingRepo = null;
		}
	}

	async function installFromUrl() {
		if (await install(installInput)) {
			installInput = "";
		}
	}

	async function updatePlugin(plugin: InstalledGardenPlugin) {
		const repo = plugin.registryEntry?.repo;

		if (!repo) {
			new Notice(
				`${plugin.manifest.name} has no recorded source repository. Reinstall it from a GitHub URL to enable updates.`,
			);

			return;
		}

		if (!communityEnabled) {
			activeTab = "browse";

			return;
		}

		await install(repo);
	}

	async function turnOffCommunityPlugins() {
		settings.gardenCommunityPluginsEnabled = false;
		await saveSettings();
		communityEnabled = false;
	}

	let confirmUninstallId: string | null = null;

	async function uninstall(plugin: InstalledGardenPlugin) {
		busy = true;

		try {
			await manager.uninstall(plugin);

			new Notice(
				`Uninstalled ${plugin.manifest.name}. ${buildTriggeredNotice(
					settings,
				)}`,
			);
			confirmUninstallId = null;
			await refresh();
		} catch (error) {
			if (error instanceof PublishBranchMissingError) {
				notifyPublishBranchMissing(error);
			} else {
				new Notice(`Could not uninstall ${plugin.manifest.name}`);
			}
		}

		busy = false;
	}

	$: regionProviders = getRegionProviders(installed);

	function pluginName(id: string): string {
		return (
			installed.find((plugin) => plugin.manifest.id === id)?.manifest
				.name ?? id
		);
	}

	function providedRegions(plugin: InstalledGardenPlugin): string[] {
		return regionsOf(plugin.manifest).filter(
			(region) => regionProviders[region] === plugin.manifest.id,
		);
	}

	function blockedRegions(
		plugin: InstalledGardenPlugin,
	): { region: string; providerId: string }[] {
		if (!plugin.enabled) {
			return [];
		}

		return regionsOf(plugin.manifest)
			.filter(
				(region) =>
					regionProviders[region] &&
					regionProviders[region] !== plugin.manifest.id,
			)
			.map((region) => ({ region, providerId: regionProviders[region] }));
	}

	$: filteredCommunity = community.filter(
		(entry) =>
			!communityFilter ||
			entry.name.toLowerCase().includes(communityFilter.toLowerCase()) ||
			entry.description
				.toLowerCase()
				.includes(communityFilter.toLowerCase()),
	);
</script>

<div class="dg-plugins">
	<div class="dg-plugin-tabs" role="tablist">
		<button
			role="tab"
			aria-selected={activeTab === "installed"}
			class:is-active={activeTab === "installed"}
			on:click={() => (activeTab = "installed")}
		>
			Installed{#if !loading}&nbsp;({installed.length}){/if}
		</button>

		<button
			role="tab"
			aria-selected={activeTab === "browse"}
			class:is-active={activeTab === "browse"}
			on:click={() => (activeTab = "browse")}
		>
			Browse &amp; install{#if community.length > 0}&nbsp;({community.length}){/if}
		</button>
	</div>

	{#if activeTab === "installed"}
		{#if loading}
			<div
				class="dg-plugins-loading"
				role="status"
				aria-label="Loading plugins from your garden repository"
			>
				{#each [0, 1, 2] as i (i)}
					<div
						class="dg-skeleton-row"
						style={`--dg-skeleton-delay: ${i * 0.15}s`}
					>
						<div class="dg-skeleton-info">
							<span class="dg-skeleton dg-skeleton-title"></span>
							<span class="dg-skeleton dg-skeleton-text"></span>
						</div>
						<span class="dg-skeleton dg-skeleton-pill"></span>
					</div>
				{/each}

				<p class="dg-plugins-loading-hint">
					<span class="dg-spinner" aria-hidden="true"></span>
					Reading plugins from your garden repository…
				</p>
			</div>
		{:else if loadError}
			<p class="dg-plugins-error">{loadError}</p>
		{:else}
			{#if installed.length === 0}
				<p>
					No plugins found. If your garden predates the plugin system,
					update your site template first.
				</p>
			{/if}

			{#if installed.length > 1}
				<p class="dg-plugin-order-hint">
					The order here is the render order. Plugins that share a
					place on the page, like the bottom-right corner, stack in
					this order.
				</p>
			{/if}
			{#each installed as plugin, index (plugin.manifest.id)}
				<div class="dg-plugin-row" class:is-disabled={!plugin.enabled}>
					<div class="dg-plugin-row-main">
						<div class="dg-plugin-row-info">
							<span class="dg-plugin-name">
								{plugin.manifest.name}
								<span class="dg-plugin-version"
									>v{plugin.manifest.version}</span
								>

								{#if plugin.isFirstParty}
									<span class="dg-plugin-badge"
										>Core plugin</span
									>
								{/if}

								{#each providedRegions(plugin) as region (region)}
									<span class="dg-plugin-badge is-region"
										>Provides {region}</span
									>
								{/each}
							</span>

							<span class="dg-plugin-description"
								>{plugin.manifest.description}</span
							>

							<span class="dg-plugin-author"
								>by {plugin.manifest.author}</span
							>

							{#each blockedRegions(plugin) as blocked (blocked.region)}
								<span class="dg-plugin-region-notice">
									{blocked.region.charAt(0).toUpperCase() +
										blocked.region.slice(1)} is currently provided
									by
									<strong
										>{pluginName(
											blocked.providerId,
										)}</strong
									>
									— disable it to activate this plugin.
								</span>
							{/each}
						</div>

						<div class="dg-plugin-row-actions">
							{#if installed.length > 1}
								<button
									aria-label="Render earlier"
									title="Render earlier"
									disabled={busy || index === 0}
									on:click={() => move(plugin, -1)}>↑</button
								>
								<button
									aria-label="Render later"
									title="Render later"
									disabled={busy ||
										index === installed.length - 1}
									on:click={() => move(plugin, 1)}>↓</button
								>
							{/if}

							{#if (plugin.manifest.settings ?? []).length > 0 || noteSettingKeysFor(plugin).length > 0}
								<button
									disabled={busy}
									on:click={() => openSettings(plugin)}
									>Settings</button
								>
							{/if}

							{#if !plugin.isFirstParty}
								<button
									disabled={busy}
									on:click={() => updatePlugin(plugin)}
									>{installingRepo &&
									installingRepo ===
										plugin.registryEntry?.repo
										? "Updating…"
										: "Update"}</button
								>

								{#if confirmUninstallId === plugin.manifest.id}
									<button
										class="mod-warning"
										disabled={busy}
										on:click={() => uninstall(plugin)}
										>Confirm removal</button
									>
								{:else}
									<button
										disabled={busy}
										on:click={() =>
											(confirmUninstallId =
												plugin.manifest.id)}
										>Uninstall</button
									>
								{/if}
							{/if}

							<label class="dg-plugin-toggle">
								<input
									type="checkbox"
									checked={plugin.enabled}
									disabled={busy}
									on:change={() => toggleEnabled(plugin)}
								/>
								{plugin.enabled ? "Enabled" : "Disabled"}
							</label>
						</div>
					</div>

					{#if expandedSettingsId === plugin.manifest.id}
						<div class="dg-plugin-settings">
							{#each noteSettingKeysFor(plugin) as key (key)}
								<label class="dg-plugin-setting">
									<span>
										<span class="dg-plugin-setting-name"
											>Enabled by default on notes</span
										>
										<span class="dg-plugin-setting-desc">
											Override per note with
											<code
												>{key.replace(
													/[A-Z]/g,
													(c) =>
														`-${c.toLowerCase()}`,
												)}</code
											> in frontmatter.
										</span>
									</span>

									<input
										type="checkbox"
										checked={settings.defaultNoteSettings[
											key
										]}
										disabled={busy}
										on:change={() => toggleNoteSetting(key)}
									/>
								</label>
							{/each}

							{#each plugin.manifest.settings ?? [] as entry (entry.key)}
								<label class="dg-plugin-setting">
									<span>
										<span class="dg-plugin-setting-name"
											>{entry.name}</span
										>

										{#if entry.description}
											<span class="dg-plugin-setting-desc"
												>{entry.description}</span
											>
										{/if}
									</span>

									{#if entry.type === "boolean"}
										<input
											type="checkbox"
											checked={Boolean(
												settingsDraft[entry.key],
											)}
											on:change={(event) =>
												(settingsDraft[entry.key] =
													event.currentTarget.checked)}
										/>
									{:else if entry.type === "select"}
										<select
											value={String(
												settingsDraft[entry.key] ?? "",
											)}
											on:change={(event) =>
												(settingsDraft[entry.key] =
													event.currentTarget.value)}
										>
											{#each entry.options ?? [] as option (option)}
												<option value={option}
													>{option}</option
												>
											{/each}
										</select>
									{:else}
										<input
											type={entry.type === "number"
												? "number"
												: "text"}
											value={String(
												settingsDraft[entry.key] ?? "",
											)}
											on:input={(event) =>
												(settingsDraft[entry.key] =
													coerce(
														entry,
														event.currentTarget
															.value,
													))}
										/>
									{/if}
								</label>
							{/each}

							{#if (plugin.manifest.settings ?? []).length > 0}
								<button
									class="mod-cta"
									disabled={busy}
									on:click={() => saveDraft(plugin)}
									>Save plugin settings</button
								>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	{:else if !communityEnabled}
		<CommunityPluginsGate
			{settings}
			{saveSettings}
			onEnabled={() => (communityEnabled = true)}
		/>
	{:else}
		{#if communityLoading}
			<div
				class="dg-plugin-list"
				role="status"
				aria-label="Loading community plugins"
			>
				{#each [0, 1, 2] as i (i)}
					<div
						class="dg-skeleton-card"
						style={`--dg-skeleton-delay: ${i * 0.15}s`}
					>
						<span class="dg-skeleton dg-skeleton-title"></span>
						<span class="dg-skeleton dg-skeleton-text"></span>
					</div>
				{/each}
			</div>
		{:else if community.length === 0}
			<p>
				The community plugin directory is not available right now. You
				can still install any plugin from its GitHub URL below.
			</p>
		{:else}
			<div class="dg-plugin-browser">
				<div class="dg-plugin-browser-list">
					<input
						class="dg-plugin-search"
						type="text"
						placeholder="Search community plugins…"
						bind:value={communityFilter}
					/>

					<div class="dg-plugin-list">
						{#each filteredCommunity as entry (entry.id)}
							<button
								class="dg-plugin-item"
								class:is-selected={selected?.id === entry.id}
								aria-pressed={selected?.id === entry.id}
								on:click={() => (selected = entry)}
							>
								<span class="dg-plugin-name"
									>{entry.name}
									{#if installedIds().has(entry.id)}
										<span class="dg-plugin-badge"
											>Installed</span
										>
									{/if}
								</span>
								<span class="dg-plugin-author"
									>by {entry.author}</span
								>
								<span class="dg-plugin-description"
									>{entry.description}</span
								>
							</button>
						{:else}
							<p class="dg-plugins-intro">No plugins match.</p>
						{/each}
					</div>
				</div>

				<div class="dg-plugin-detail">
					{#if selected}
						{@const entry = selected}
						<div class="dg-plugin-detail-header">
							<div class="dg-plugin-row-info">
								<span class="dg-plugin-detail-name"
									>{entry.name}</span
								>
								<span class="dg-plugin-author"
									>by {entry.author} ·
									<a href={`https://github.com/${entry.repo}`}
										>{entry.repo}</a
									></span
								>
								<span class="dg-plugin-description"
									>{entry.description}</span
								>
							</div>

							{#if installedIds().has(entry.id)}
								<button disabled>Installed</button>
							{:else}
								<button
									class="mod-cta"
									disabled={busy}
									on:click={() => install(entry.repo)}
									>{installingRepo === entry.repo
										? "Installing…"
										: "Install"}</button
								>
							{/if}
						</div>

						{#key entry.repo}
							<PluginReadme {app} {manager} repo={entry.repo} />
						{/key}
					{:else}
						<p class="dg-plugins-intro">
							Select a plugin to see its details.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<h3>Install from GitHub</h3>

		<p class="dg-plugins-intro">
			Paste the URL of a plugin repository, e.g.
			<code>https://github.com/user/garden-plugin-example</code>.
		</p>

		<form
			class="dg-plugin-install-row"
			on:submit|preventDefault={installFromUrl}
		>
			<input
				type="text"
				placeholder="https://github.com/user/repo"
				bind:value={installInput}
				disabled={busy}
			/>

			<button
				type="submit"
				class="mod-cta"
				disabled={busy || !installInput.trim()}
				>{installingRepo === installInput && installInput
					? "Installing…"
					: "Install"}</button
			>
		</form>

		{#if installError}
			<p class="dg-plugins-error">{installError}</p>
		{/if}

		<p class="dg-community-off">
			Community plugins are on.
			<button class="dg-link-button" on:click={turnOffCommunityPlugins}
				>Turn off</button
			>
		</p>
	{/if}
</div>

<style>
	.dg-plugins {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.dg-plugins h3 {
		margin: 16px 0 4px 0;
	}

	.dg-plugin-tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--background-modifier-border);
		margin-bottom: 4px;
	}

	.dg-plugin-tabs button {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		padding: 8px 14px;
		font-size: 0.95em;
		color: var(--text-muted);
		cursor: pointer;
		box-shadow: none;
	}

	.dg-plugin-tabs button:hover {
		color: var(--text-normal);
	}

	.dg-plugin-tabs button.is-active {
		color: var(--text-normal);
		font-weight: 600;
		border-bottom-color: var(--interactive-accent);
	}

	.dg-plugins-intro {
		color: var(--text-muted);
		margin: 0;
	}

	.dg-plugins-error {
		color: var(--text-error);
	}

	.dg-plugins-loading {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.dg-skeleton-row {
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		padding: 10px 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.dg-skeleton-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}

	.dg-skeleton-card {
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.dg-skeleton {
		display: block;
		border-radius: 4px;
		background: var(--background-modifier-hover, rgba(128, 128, 128, 0.15));
		animation: dg-skeleton-pulse 1.4s ease-in-out infinite;
		animation-delay: var(--dg-skeleton-delay, 0s);
	}

	.dg-skeleton-title {
		height: 0.9rem;
		width: 40%;
	}

	.dg-skeleton-text {
		height: 0.7rem;
		width: 75%;
	}

	.dg-skeleton-pill {
		height: 1.4rem;
		width: 5.5rem;
		border-radius: 999px;
	}

	.dg-plugins-loading-hint {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
		font-size: 0.85em;
		margin: 4px 0 0;
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

	@keyframes dg-skeleton-pulse {
		0%,
		100% {
			opacity: 0.45;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes dg-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dg-skeleton {
			animation: none;
			opacity: 0.6;
		}

		.dg-spinner {
			animation-duration: 2.5s;
		}
	}

	.dg-plugin-row {
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		padding: 10px 12px;
	}

	.dg-plugin-row.is-disabled {
		opacity: 0.6;
	}

	.dg-plugin-row-main {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.dg-plugin-row-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 200px;
		flex: 1;
	}

	.dg-plugin-name {
		font-weight: 600;
	}

	.dg-plugin-version,
	.dg-plugin-author {
		color: var(--text-muted);
		font-size: 0.85em;
		font-weight: 400;
	}

	.dg-plugin-badge {
		background: var(--background-modifier-border);
		border-radius: 4px;
		font-size: 0.75em;
		font-weight: 500;
		padding: 1px 6px;
		margin-left: 4px;
	}

	.dg-plugin-badge.is-region {
		background: var(--interactive-accent);
		color: var(--text-on-accent, #fff);
	}

	.dg-plugin-region-notice {
		font-size: 0.85em;
		color: var(--text-warning, var(--text-muted));
		margin-top: 4px;
	}

	.dg-plugin-description {
		font-size: 0.9em;
	}

	.dg-plugin-row-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.dg-plugin-order-hint {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-plugin-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.9em;
	}

	.dg-plugin-settings {
		border-top: 1px solid var(--background-modifier-border);
		margin-top: 10px;
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.dg-plugin-setting {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
	}

	.dg-plugin-setting > span {
		display: flex;
		flex-direction: column;
	}

	.dg-plugin-setting-name {
		font-weight: 500;
	}

	.dg-plugin-setting-desc {
		color: var(--text-muted);
		font-size: 0.85em;
	}

	.dg-plugin-install-row {
		display: flex;
		gap: 8px;
	}

	.dg-plugin-install-row input {
		flex: 1;
	}

	.dg-plugin-search {
		width: 100%;
	}

	.dg-plugin-browser {
		display: grid;
		grid-template-columns: minmax(220px, 2fr) 3fr;
		gap: 16px;
		height: min(60vh, 560px);
		margin-top: 8px;
	}

	.dg-plugin-browser-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
	}

	.dg-plugin-browser-list .dg-plugin-list {
		overflow-y: auto;
		flex: 1;
		padding-right: 4px;
	}

	.dg-plugin-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.dg-plugin-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex-shrink: 0;
		gap: 2px;
		height: auto;
		width: 100%;
		padding: 10px 12px;
		text-align: left;
		white-space: normal;
		background: none;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		box-shadow: none;
		cursor: pointer;
	}

	.dg-plugin-item:hover {
		background: var(--background-modifier-hover);
	}

	.dg-plugin-item.is-selected {
		background: var(--background-modifier-active-hover);
		border-color: var(--interactive-accent);
	}

	.dg-plugin-detail {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
		overflow-y: auto;
		padding-left: 16px;
		border-left: 1px solid var(--background-modifier-border);
	}

	.dg-plugin-detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.dg-plugin-detail-name {
		font-size: 1.3em;
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.dg-plugin-browser {
			grid-template-columns: 1fr;
			height: auto;
		}

		.dg-plugin-browser-list .dg-plugin-list {
			max-height: 40vh;
		}

		.dg-plugin-detail {
			padding-left: 0;
			border-left: none;
		}
	}

	.dg-community-off {
		margin: 16px 0 0;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-link-button {
		background: none;
		border: none;
		box-shadow: none;
		padding: 0;
		height: auto;
		color: var(--text-accent);
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
	}
</style>
