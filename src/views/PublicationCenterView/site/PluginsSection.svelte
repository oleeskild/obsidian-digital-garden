<!-- src/views/PublicationCenterView/site/PluginsSection.svelte -->
<script lang="ts">
	import GardenPluginsView from "../../GardenPluginSettings/GardenPluginsView.svelte";
	import { GardenPluginManager } from "../../../gardenPlugins/GardenPluginManager";
	import PublishPlatformConnectionFactory from "../../../repositoryConnection/PublishPlatformConnectionFactory";
	import { RepositoryConnection } from "../../../repositoryConnection/RepositoryConnection";
	import { saveSiteSettingsAndUpdateEnv } from "../../SettingsView/saveSiteSettingsAndUpdateEnv";
	import SiteRow from "./SiteRow.svelte";
	import { getSiteContext } from "./siteContext";

	/** Community plugin to select in Browse & install. */
	export let pluginId: string | undefined = undefined;

	const { app, settings, saveSettings, edit, changes, notifySiteChanged } =
		getSiteContext();

	async function connect() {
		const manager = new GardenPluginManager(
			new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					settings,
				),
			),
			settings,
		);
		manager.onSiteChanged = notifySiteChanged;

		return manager;
	}

	// Search and link previews are .env keys; the manager writes them to
	// the site straight away, so recompute what's pending afterwards.
	async function applyNoteSettingsToSite(keys: string[]) {
		const saved = await saveSiteSettingsAndUpdateEnv(
			app.metadataCache,
			settings,
			saveSettings,
			new Set(keys),
		);

		if (saved) notifySiteChanged();
		await edit();
	}

	let attempt = 0;
</script>

<p class="dg-site-intro">
	Garden plugins add features to your site, like search and link previews.
	Unlike other site settings, plugin changes don't wait for Publish: each one
	is saved to your site as soon as you make it.
</p>

<!-- Only shown when they differ from the site. -->
{#if $changes.has("dgEnableSearch")}
	<SiteRow id="dgEnableSearch" name="Search" />
{/if}
{#if $changes.has("dgLinkPreview")}
	<SiteRow id="dgLinkPreview" name="Link previews" />
{/if}

{#key attempt}
	{#await connect()}
		<p class="dg-site-intro" role="status">Connecting to your garden…</p>
	{:then manager}
		{#key pluginId}
			<GardenPluginsView
				{app}
				{manager}
				{settings}
				{saveSettings}
				{applyNoteSettingsToSite}
				initialTab={pluginId ? "browse" : "installed"}
				initialPluginId={pluginId}
			/>
		{/key}
	{:catch}
		<p class="dg-site-intro" role="alert">
			Couldn't connect to your garden.
			<button on:click={() => attempt++}>Try again</button>
		</p>
	{/await}
{/key}

<style>
	.dg-site-intro {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}
</style>
