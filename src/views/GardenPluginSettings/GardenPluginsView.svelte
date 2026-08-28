<script lang="ts">
	import { onMount, tick } from "svelte";
	import { Notice } from "obsidian";
	import type {
		GardenPluginManager,
		RemoteGardenPlugin,
	} from "../../gardenPlugins/GardenPluginManager";
	import type {
		CommunityGardenPlugin,
		GardenPluginSettingEntry,
		InstalledGardenPlugin,
	} from "../../models/gardenPlugin";
	import type DigitalGardenSettings from "../../models/settings";
	import {
		getRegionConflicts,
		getRegionProviders,
		regionsOf,
	} from "../../gardenPlugins/regions";
	import { buildTriggeredNotice } from "../../gardenPlugins/notices";

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

	let installInput = "";
	let inspecting = false;
	let installError: string | null = null;
	let pendingInstall: RemoteGardenPlugin | null = null;
	let pendingIsUpdate = false;

	let installConfirmEl: HTMLElement | undefined;
	let installErrorEl: HTMLElement | undefined;
	let expandedSettingsId: string | null = null;
	let settingsDraft: Record<string, string | number | boolean> = {};
	let activeTab: "installed" | "browse" = "installed";

	onMount(async () => {
		await refresh();
		community = await manager.fetchCommunityPlugins();
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
		} catch {
			new Notice(`Could not save settings for ${plugin.manifest.name}`);
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

	async function inspect(repoInput: string, isUpdate = false) {
		inspecting = true;
		installError = null;
		pendingInstall = null;
		disableConflicts = true;

		try {
			const remote = await manager.inspectRemotePlugin(repoInput);

			if (!isUpdate && installedIds().has(remote.manifest.id)) {
				pendingIsUpdate = true;
			} else {
				pendingIsUpdate = isUpdate;
			}

			pendingInstall = remote;
		} catch (error) {
			installError =
				error instanceof Error ? error.message : "Unknown error";
		}

		inspecting = false;

		// The confirmation (or error) renders near the top of the tab —
		// possibly far from the gallery card that was clicked.
		await tick();

		const target = installConfirmEl ?? installErrorEl;

		target?.scrollIntoView({
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches
				? "auto"
				: "smooth",
			block: "center",
		});
	}

	async function confirmInstall() {
		if (!pendingInstall) {
			return;
		}

		busy = true;
		const remote = pendingInstall;

		const existingEntry = installed.find(
			(plugin) => plugin.manifest.id === remote.manifest.id,
		)?.registryEntry;

		const disableIds = disableConflicts
			? pendingConflicts.map((conflict) => conflict.manifest.id)
			: [];

		try {
			await manager.install(remote, existingEntry, disableIds);

			new Notice(
				`${pendingIsUpdate ? "Updated" : "Installed"} ${
					remote.manifest.name
				} ${remote.manifest.version}. ${buildTriggeredNotice(
					settings,
				)}`,
			);
			pendingInstall = null;
			installInput = "";
			await refresh();
		} catch (error) {
			installError =
				error instanceof Error ? error.message : "Install failed";
		}

		busy = false;
	}

	async function updatePlugin(plugin: InstalledGardenPlugin) {
		const repo = plugin.registryEntry?.repo;

		if (!repo) {
			installError = `${plugin.manifest.name} has no recorded source repository. Reinstall it from a GitHub URL to enable updates.`;

			return;
		}

		// The confirmation panel lives in the browse tab
		activeTab = "browse";
		await inspect(repo, true);
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
		} catch {
			new Notice(`Could not uninstall ${plugin.manifest.name}`);
		}

		busy = false;
	}

	$: regionProviders = getRegionProviders(installed);

	$: pendingConflicts = pendingInstall
		? getRegionConflicts(pendingInstall.manifest, installed)
		: [];

	let disableConflicts = true;

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
		<p class="dg-plugins-intro">
			Plugins extend your garden with new features. They are stored in
			your garden repository under <code>src/plugins/</code> — this list is
			read directly from it.
		</p>

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

			{#each installed as plugin (plugin.manifest.id)}
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
									>Update</button
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
	{:else}
		<h3>Install from GitHub</h3>

		<p class="dg-plugins-intro">
			Paste the URL of a plugin repository, e.g.
			<code>https://github.com/user/garden-plugin-example</code>.
		</p>

		<div class="dg-plugin-install-row">
			<input
				type="text"
				placeholder="https://github.com/user/repo"
				bind:value={installInput}
				disabled={inspecting || busy}
			/>

			<button
				class="mod-cta"
				disabled={inspecting || busy || !installInput.trim()}
				on:click={() => inspect(installInput)}
				>{inspecting ? "Checking…" : "Install"}</button
			>
		</div>

		{#if installError}
			<p class="dg-plugins-error" bind:this={installErrorEl}>
				{installError}
			</p>
		{/if}

		{#if pendingInstall}
			<div class="dg-plugin-confirm" bind:this={installConfirmEl}>
				<p class="dg-plugin-confirm-title">
					{pendingIsUpdate ? "Update" : "Install"}
					<strong>{pendingInstall.manifest.name}</strong>
					v{pendingInstall.manifest.version} by {pendingInstall
						.manifest.author}?
				</p>

				<p>{pendingInstall.manifest.description}</p>

				<p class="dg-plugin-confirm-warning">
					⚠️ Plugins run their own code in your site's build and in
					your visitors' browsers. Only install plugins from authors
					you trust — review the code at
					<a
						href={`https://github.com/${pendingInstall.owner}/${pendingInstall.repo}`}
						>{pendingInstall.owner}/{pendingInstall.repo}</a
					>
					({pendingInstall.files.length} files, ref
					<code>{pendingInstall.ref}</code>).
				</p>

				{#if pendingConflicts.length > 0}
					<label class="dg-plugin-conflict-choice">
						<input
							type="checkbox"
							bind:checked={disableConflicts}
						/>
						<span>
							{pendingInstall.manifest.name} replaces
							<strong
								>{pendingConflicts
									.map((c) => c.manifest.name)
									.join(", ")}</strong
							>
							({regionsOf(pendingInstall.manifest).join(", ")}).
							Disable {pendingConflicts.length === 1
								? "it"
								: "them"} so {pendingInstall.manifest.name} takes
							over right away.
						</span>
					</label>
				{/if}

				<div class="dg-plugin-confirm-actions">
					<button
						class="mod-cta"
						disabled={busy}
						on:click={confirmInstall}
						>{busy
							? "Working…"
							: pendingIsUpdate
							? "Update plugin"
							: "Install plugin"}</button
					>

					<button
						disabled={busy}
						on:click={() => (pendingInstall = null)}>Cancel</button
					>
				</div>
			</div>
		{/if}

		<h3>Browse community plugins</h3>

		{#if communityLoading}
			<div
				class="dg-plugin-grid"
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
						<span class="dg-skeleton dg-skeleton-text short"></span>
					</div>
				{/each}
			</div>
		{:else if community.length === 0}
			<p>
				The community plugin directory is not available right now. You
				can still install any plugin from its GitHub URL above.
			</p>
		{:else}
			<input
				class="dg-plugin-search"
				type="text"
				placeholder="Search community plugins…"
				bind:value={communityFilter}
			/>

			<div class="dg-plugin-grid">
				{#each filteredCommunity as entry (entry.id)}
					<div class="dg-plugin-card">
						{#if entry.screenshot}
							<img
								class="dg-plugin-card-image"
								loading="lazy"
								alt={entry.name}
								src={`https://raw.githubusercontent.com/${entry.repo}/HEAD/${entry.screenshot}`}
							/>
						{/if}

						<div class="dg-plugin-card-body">
							<span class="dg-plugin-name">{entry.name}</span>

							<span class="dg-plugin-description"
								>{entry.description}</span
							>

							<span class="dg-plugin-author"
								>by {entry.author}</span
							>

							{#if installedIds().has(entry.id)}
								<button disabled>Installed</button>
							{:else}
								<button
									class="mod-cta"
									disabled={inspecting || busy}
									on:click={() => inspect(entry.repo)}
									>Install</button
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
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

	.dg-skeleton-text.short {
		width: 45%;
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

	.dg-plugin-conflict-choice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 10px;
		font-size: 0.92em;
	}

	.dg-plugin-conflict-choice input {
		margin-top: 3px;
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

	.dg-plugin-confirm {
		border: 1px solid var(--background-modifier-border);
		border-left: 3px solid var(--interactive-accent);
		border-radius: 8px;
		padding: 10px 14px;
	}

	.dg-plugin-confirm-title {
		margin-top: 0;
	}

	.dg-plugin-confirm-warning {
		color: var(--text-warning, var(--text-muted));
	}

	.dg-plugin-confirm-actions {
		display: flex;
		gap: 8px;
	}

	.dg-plugin-search {
		width: 100%;
	}

	.dg-plugin-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
	}

	.dg-plugin-card {
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.dg-plugin-card-image {
		width: 100%;
		height: 90px;
		object-fit: cover;
	}

	.dg-plugin-card-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 10px;
	}
</style>
