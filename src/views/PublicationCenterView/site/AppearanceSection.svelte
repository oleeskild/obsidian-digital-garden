<!-- src/views/PublicationCenterView/site/AppearanceSection.svelte -->
<script lang="ts">
	import { onMount } from "svelte";
	import { writable } from "svelte/store";
	import SiteRow from "./SiteRow.svelte";
	import ThemePicker from "./ThemePicker.svelte";
	import { getSiteContext } from "./siteContext";
	import { fileSuggest, toggle } from "./obsidianControls";
	import { loadThemes } from "./themes";
	import { PublishPlatform } from "../../../models/PublishPlatform";
	import type { PickableTheme } from "./themes";

	const { app, settings, edit } = getSiteContext();

	// Forestry.md's Design Lab previews themes live on the published site.
	const pageName = settings.forestrySettings?.forestryPageName;

	const designLabUrl =
		settings.publishPlatform === PublishPlatform.ForestryMd && pageName
			? `https://dashboard.forestry.md/style-editor/${encodeURIComponent(
					pageName,
			  )}`
			: null;

	// Kept here so the light/dark control follows a theme pick.
	let baseTheme = settings.baseTheme;
	let themeModes = modesOf(settings.theme);
	let modeNote = "";

	function modesOf(theme: string): string[] {
		const modes = JSON.parse(theme).modes;

		return Array.isArray(modes) && modes.length > 0
			? modes
			: ["dark", "light"];
	}

	function themePicked() {
		const switched = settings.baseTheme !== baseTheme;
		baseTheme = settings.baseTheme;
		themeModes = modesOf(settings.theme);

		modeNote = switched
			? `Switched to ${baseTheme}, the only mode ${
					JSON.parse(settings.theme).name
			  } has.`
			: "";
	}

	const themes = writable<PickableTheme[]>([]);
	let themesLoading = true;
	let themesError = false;

	async function fetchThemes() {
		themesLoading = true;
		themesError = false;

		try {
			themes.set(await loadThemes());
		} catch {
			themesError = true;
		} finally {
			themesLoading = false;
		}
	}

	onMount(fetchThemes);

	// The Style Settings plugin is internal API; it may be missing or change.
	const styleSettingsLoaded = (() => {
		try {
			const plugins = (
				app as unknown as {
					plugins?: {
						plugins?: Record<string, { _loaded?: boolean }>;
					};
				}
			).plugins?.plugins;

			return !!plugins?.["obsidian-style-settings"]?._loaded;
		} catch {
			return false;
		}
	})();

	let styleNote = "";

	async function captureStyleSettings() {
		const css =
			document.querySelector("#css-settings-manager")?.textContent ?? "";
		const bodyClasses = document.body.className;

		if (!css && !bodyClasses) {
			styleNote = "No Style Settings found to capture.";

			return;
		}
		settings.styleSettingsCss = css;
		settings.styleSettingsBodyClasses = bodyClasses;
		styleNote = "Captured your current Style Settings.";
		await edit();
	}

	async function clearStyleSettings() {
		settings.styleSettingsCss = "";
		settings.styleSettingsBodyClasses = "";
		styleNote = "";
		await edit();
	}

	const setText = (apply: (value: string) => void) => async (e: Event) => {
		apply((e.currentTarget as HTMLInputElement).value);
		await edit();
	};
</script>

<SiteRow
	id="THEME"
	name="Theme"
	description="Any Obsidian community theme works on your site."
	stacked
>
	<svelte:fragment slot="hint">
		{#if designLabUrl}
			<p class="dg-site-hint">
				Want to see a theme on your own notes first? Try it live in the
				<a href={designLabUrl}>Design Lab</a> on Forestry.md.
			</p>
		{/if}
	</svelte:fragment>
	<ThemePicker
		themes={$themes}
		loading={themesLoading}
		error={themesError}
		onRetry={fetchThemes}
		onPick={themePicked}
	/>
</SiteRow>

<SiteRow
	id="BASE_THEME"
	name="Light or dark"
	description="Which of the theme's modes your site uses."
>
	<svelte:fragment slot="hint">
		{#if modeNote}
			<p class="dg-site-hint" role="status">{modeNote}</p>
		{/if}
	</svelte:fragment>
	<select
		class="dropdown"
		aria-label="Light or dark"
		value={baseTheme}
		on:change={setText((v) => {
			settings.baseTheme = baseTheme = v;
			modeNote = "";
		})}
	>
		<option value="dark" disabled={!themeModes.includes("dark")}
			>Dark</option
		>
		<option value="light" disabled={!themeModes.includes("light")}
			>Light</option
		>
	</select>
</SiteRow>

<SiteRow
	id="SITE_NAME_HEADER"
	name="Site name"
	description="Shown in the site header, unless you set a logo."
>
	<input
		type="text"
		aria-label="Site name"
		value={settings.siteName}
		on:input={setText((v) => (settings.siteName = v))}
	/>
</SiteRow>

<SiteRow
	id="asset:logo"
	name="Logo"
	description="An image in your vault, shown instead of the site name. Leave empty to show the name."
>
	<input
		type="text"
		aria-label="Logo image path"
		placeholder="images/logo.png"
		value={settings.logoPath}
		use:fileSuggest={{ app, kind: "image" }}
		on:input={setText((v) => (settings.logoPath = v))}
	/>
</SiteRow>

<SiteRow
	id="LOGO_HEIGHT"
	name="Logo size"
	description="Logo height. A number means pixels (40), or use any CSS size (3rem). Leave empty for the default."
>
	<input
		type="text"
		aria-label="Logo size"
		placeholder="40"
		value={settings.logoHeight}
		on:input={setText((v) => (settings.logoHeight = v.trim()))}
	/>
</SiteRow>

<SiteRow
	id="asset:favicon"
	name="Favicon"
	description="A square SVG in your vault, shown in browser tabs. Leave empty for the default."
>
	<input
		type="text"
		aria-label="Favicon path"
		placeholder="images/favicon.svg"
		value={settings.faviconPath}
		use:fileSuggest={{ app, kind: "svg" }}
		on:input={setText((v) => (settings.faviconPath = v))}
	/>
</SiteRow>

<SiteRow
	id="SITE_MAIN_LANGUAGE"
	name="Main language"
	description="Two-letter language code (ISO 639-1), so browsers and search engines know your site's language."
>
	<input
		type="text"
		aria-label="Main language"
		placeholder="en"
		value={settings.mainLanguage}
		on:input={setText((v) => (settings.mainLanguage = v))}
	/>
</SiteRow>

<SiteRow
	id="USE_FULL_RESOLUTION_IMAGES"
	name="Full resolution images"
	description="Images are compressed by default so pages load faster. Turn this on to publish them at full size."
>
	<div
		use:toggle={{
			value: settings.useFullResolutionImages,
			label: "Full resolution images",
			onChange: async (v) => {
				settings.useFullResolutionImages = v;
				await edit();
			},
		}}
	></div>
</SiteRow>

<SiteRow
	id="styleSettings"
	name="Style Settings"
	description={styleSettingsLoaded
		? "Use the theme tweaks you made with the Style Settings plugin. Select your site's theme in Obsidian first, then capture."
		: "Install and enable the Style Settings plugin to carry its theme tweaks over to your site."}
>
	<div class="dg-site-buttons">
		<button disabled={!styleSettingsLoaded} on:click={captureStyleSettings}>
			Capture
		</button>
		<button
			disabled={!settings.styleSettingsCss &&
				!settings.styleSettingsBodyClasses}
			on:click={clearStyleSettings}
		>
			Clear
		</button>
	</div>
</SiteRow>
{#if styleNote}
	<p class="dg-site-note" role="status">{styleNote}</p>
{/if}

<style>
	.dg-site-buttons {
		display: flex;
		gap: 8px;
	}

	.dg-site-hint {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-site-note {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}
</style>
