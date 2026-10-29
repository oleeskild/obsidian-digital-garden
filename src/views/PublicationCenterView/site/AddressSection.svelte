<!-- src/views/PublicationCenterView/site/AddressSection.svelte -->
<script lang="ts">
	import SiteRow from "./SiteRow.svelte";
	import { getSiteContext } from "./siteContext";

	const { settings, isForestry, edit } = getSiteContext();

	async function set(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;

		if (isForestry) settings.forestrySettings.baseUrl = value;
		else settings.gardenBaseUrl = value;
		await edit();
	}
</script>

{#if isForestry}
	<SiteRow
		name="Base URL"
		description="Your garden's address, used by the Copy garden URL command. It's only kept in this vault, so there's nothing to publish. Forestry.md sets it when you connect; change it only if you use your own domain."
	>
		<input
			type="text"
			inputmode="url"
			autocomplete="off"
			spellcheck="false"
			aria-label="Base URL"
			placeholder="https://my-garden.forestry.md"
			value={settings.forestrySettings.baseUrl}
			on:input={set}
		/>
	</SiteRow>
{:else}
	<SiteRow
		id="SITE_BASE_URL"
		name="Base URL"
		description="Your garden's address. Used for the sitemap and RSS feed, and by the Copy garden URL command."
	>
		<input
			type="text"
			inputmode="url"
			autocomplete="off"
			spellcheck="false"
			aria-label="Base URL"
			placeholder="https://my-garden.vercel.app"
			value={settings.gardenBaseUrl}
			on:input={set}
		/>
	</SiteRow>
{/if}
