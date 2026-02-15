<script lang="ts">
	import DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import type { IUserLimitsResponse } from "src/forestry/UserLimitsResponse";
	import { Notice } from "obsidian";
	import Icon from "src/ui/Icon.svelte";

	let unique = {};

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let onConnect: () => Promise<void>;
	let apiKey: string = settings.forestrySettings.apiKey;
	let limits: IUserLimitsResponse | null = null;
	let limitsLoading = false;

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
		limits = null;
	};

	const getPageInfo = async () => {
		let pageInfo = await new ForestryApi(apiKey).getPageInfo();

		return pageInfo;
	};

	const fetchLimits = async () => {
		if (!settings.forestrySettings.apiKey) return;
		limitsLoading = true;

		try {
			limits = await new ForestryApi(
				settings.forestrySettings.apiKey,
			).getUserLimits();
		} catch {
			limits = null;
		}
		limitsLoading = false;
	};

	$: if (settings.forestrySettings.apiKey) {
		fetchLimits();
	}
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

					{#if limitsLoading}
						<div class="setting-item" style="margin-top: 12px;">
							<div class="setting-item-info">
								<div class="setting-item-name">
									Loading usage info...
								</div>
							</div>
						</div>
					{:else if limits}
						<div
							style="margin-top: 16px; padding: 12px; background: var(--background-secondary); border-radius: 8px;"
						>
							<div style="font-weight: 600; margin-bottom: 8px;">
								Usage — {limits.plan} plan
							</div>
							<div
								style="display: flex; flex-direction: column; gap: 6px; font-size: 0.9em; color: var(--text-muted);"
							>
								<div
									style="display: flex; justify-content: space-between;"
								>
									<span>Builds this month</span>
									<span
										style="color: {limits.builds
											.monthlyRemaining === 0
											? 'var(--text-error)'
											: 'var(--text-normal)'};"
									>
										{limits.builds.monthlyLimit -
											limits.builds.monthlyRemaining} / {limits
											.builds.monthlyLimit}
									</span>
								</div>
								{#if limits.builds.starterCreditsRemaining > 0}
									<div
										style="display: flex; justify-content: space-between;"
									>
										<span>Starter credits remaining</span>
										<span
											>{limits.builds
												.starterCreditsRemaining}</span
										>
									</div>
								{/if}
								<div
									style="display: flex; justify-content: space-between;"
								>
									<span>Storage</span>
									<span
										style="color: {limits.storage
											.usedBytes >=
										limits.storage.limitBytes
											? 'var(--text-error)'
											: 'var(--text-normal)'};"
									>
										{limits.storage.usedFormatted} / {limits
											.storage.limitFormatted}
									</span>
								</div>
								<div
									style="display: flex; justify-content: space-between;"
								>
									<span>Sites</span>
									<span
										>{limits.sites.current} / {limits.sites
											.limit}</span
									>
								</div>
							</div>
							{#if limits.builds.monthlyRemaining === 0 || limits.storage.usedBytes >= limits.storage.limitBytes}
								<div
									style="margin-top: 8px; padding: 8px; background: var(--background-modifier-error); border-radius: 4px; font-size: 0.85em;"
								>
									You've reached your usage limit. <a
										href="https://dashboard.forestry.md/settings"
										target="_blank">Upgrade your plan</a
									> to continue publishing.
								</div>
							{/if}
						</div>
					{/if}
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
