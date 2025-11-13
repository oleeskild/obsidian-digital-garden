<script lang="ts">
	import DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import { Notice } from "obsidian";
	import Icon from "src/ui/Icon.svelte";

	let unique = {};

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let onConnect: () => Promise<void>;
	let apiKey: string = settings.forestrySettings.apiKey;

	const connect = async () => {
		let pageInfo = await getPageInfo();

		if (!pageInfo) {
			new Notice("Invalid Garden Key");

			return;
		}
		settings.forestrySettings.forestryPageName = pageInfo.value.pageName;
		settings.forestrySettings.baseUrl = pageInfo.value.baseUrl;
		settings.forestrySettings.apiKey = apiKey;
		await saveSettings();
		unique = {};
		onConnect();
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
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-name">Garden Key</div>
					<div class="setting-item-description">
						Enter your Garden Key from <a
							href="https://dashboard.forestry.md">Forestry.md</a
						> to connect your digital garden
					</div>
				</div>
				<div class="setting-item-control">
					<input
						type="text"
						bind:value={apiKey}
						placeholder="Enter your Garden Key"
						style="margin-right: 8px; min-width: 250px;"
					/>
					<button class="mod-cta" on:click={connect}>Connect</button>
				</div>
			</div>
		{:else}
			{#await getPageInfo()}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">
							Loading Forestry.md settings...
						</div>
					</div>
				</div>
			{:then pageInfo}
				{#if pageInfo}
					<div class="setting-item">
						<div class="setting-item-info">
							<div
								class="setting-item-name"
								style="display: flex; align-items: center; gap: 8px;"
							>
								<Icon name="check-circle" /> Connected to: {pageInfo
									.value.pageName ?? "Unknown"}
							</div>
							<div class="setting-item-description">
								Your digital garden is connected to Forestry.md
							</div>
						</div>

						<div class="setting-item-control">
							<button on:click={disconnect}>Disconnect</button>
						</div>
					</div>
					<div style="margin-top: 12px; margin-left: 0;">
						<a
							href="https://dashboard.forestry.md"
							target="_blank"
							style="display: inline-flex; align-items: center; gap: 4px;"
						>
							<Icon name="external-link" /> Open Forestry.md Dashboard
						</a>
					</div>
				{:else}
					<div class="setting-item">
						<div class="setting-item-info">
							<div
								class="setting-item-name"
								style="color: var(--text-error);"
							>
								Connection Error
							</div>
							<div class="setting-item-description">
								Something went wrong when connecting to
								Forestry.md
							</div>
						</div>
						<div class="setting-item-control">
							<button on:click={disconnect}>Disconnect</button>
						</div>
					</div>
				{/if}
			{:catch}
				<div class="setting-item">
					<div class="setting-item-info">
						<div
							class="setting-item-name"
							style="color: var(--text-error);"
						>
							Connection Error
						</div>
						<div class="setting-item-description">
							Something went wrong when connecting to Forestry.md
						</div>
					</div>
					<div class="setting-item-control">
						<button on:click={disconnect}>Disconnect</button>
					</div>
				</div>
			{/await}
		{/if}
	{/key}
</div>
