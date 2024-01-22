<script lang="ts">
	import DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import { Notice } from "obsidian";
	import Icon from "src/ui/Icon.svelte";

	let unique = {};

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	let apiKey: string = settings.forestrySettings.apiKey;

	const authorize = async () => {
		let pageInfo = await getPageInfo();

		if (!pageInfo) {
			new Notice("Invalid API token");

			return;
		}
		settings.forestrySettings.forestryPageName = pageInfo.value.pageName;
		settings.forestrySettings.apiKey = apiKey;
		settings.forestrySettings.baseUrl = pageInfo.value.baseUrl;
		await saveSettings();
		unique = {};
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
					Connected to {settings.forestrySettings.forestryPageName ??
						"Unknown"}
				</div>
			{:then pageInfo}
				{#if pageInfo}
					<div>
						Connected to {pageInfo.value.pageName ?? "Unknown"}
					</div>

					<button on:click={disconnect}>Disconnect</button>
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
