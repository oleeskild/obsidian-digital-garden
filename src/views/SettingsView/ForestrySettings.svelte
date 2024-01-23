<script lang="ts">
	import DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import { Notice } from "obsidian";
	import Icon from "src/ui/Icon.svelte";

	let unique = {};

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let onAuthorize: () => Promise<void>;
	let apiKey: string = settings.forestrySettings.apiKey;

	const authorize = async () => {
		let pageInfo = await getPageInfo();

		if (!pageInfo) {
			new Notice("Invalid API token");

			return;
		}
		settings.forestrySettings.forestryPageName = pageInfo.value.pageName;
		settings.forestrySettings.baseUrl = pageInfo.value.baseUrl;
		settings.forestrySettings.apiKey = apiKey;
		await saveSettings();
		unique = {};
		onAuthorize();
	};

	const disconnect = async () => {
		settings.forestrySettings.apiKey = "";
		settings.forestrySettings.forestryPageName = "";
		await saveSettings();
		apiKey = "";
	};

	const getPageInfo = async () => {
		let pageInfo = await new ForestryApi(apiKey).getPageInfo();

		return pageInfo;
	};
</script>

<div>
	<h3>
		<Icon name="trees" />Forestry.md Settings
	</h3>
	{#key unique}
		{#if !settings.forestrySettings.apiKey}
			<label>
				Forestry API Key
				<input type="text" bind:value={apiKey} />
			</label>
			<button on:click={authorize}>Authorize</button>
		{:else}
			{#await getPageInfo()}
				<div>
					Loading Forestry.md settings...
				</div>
			{:then pageInfo}
				{#if pageInfo}
					<div class="setting-item">
						<div class="setting-item-info">
							<div class="setting-item-name" style="display: flex; align-items: center;">
								<Icon name="cloud" /> Connected to page: {pageInfo.value.pageName ?? "Unknown"}
							</div>
							<div class="setting-item-description">
							</div>
						</div>

						<div class="setting-item-control">
							<button on:click={disconnect}>Disconnect</button>
						</div>
					</div>
					<a href="https://dashboard.forestry.md" target="_blank">
						Open Forestry dashboard
					</a>
				{:else}
					<div>
						Something went wrong when connecting to Forestry.md
					</div>
					<button on:click={disconnect}>Disconnect</button>
				{/if}
			{:catch}
				<div>Something went wrong when connecting to Forestry.md</div>
				<button on:click={disconnect}>Disconnect</button>
			{/await}
		{/if}
	{/key}
</div>
