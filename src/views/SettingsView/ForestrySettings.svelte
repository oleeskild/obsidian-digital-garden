<script lang="ts">
	import type DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import type { IUserLimitsResponse } from "src/forestry/UserLimitsResponse";
	import { Notice } from "obsidian";
	import Icon from "src/ui/Icon.svelte";

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let onConnect: () => Promise<void>;
	/** Runs after a successful connect (e.g. to offer picking a home page). */
	export let afterConnect: (() => void) | null = null;

	let apiKey: string = settings.forestrySettings.apiKey;
	let showKey = false;
	let limits: IUserLimitsResponse | null = null;
	let limitsLoading = false;
	let connecting = false;
	let connectError: string | null = null;
	let confirmingDisconnect = false;
	// Changing it re-runs the page info request (Try again).
	let attempt = 0;

	// Unique per instance, for label and description ids.
	const uid = Math.random().toString(36).slice(2);

	const connect = async () => {
		const trimmedKey = apiKey.trim();

		if (!trimmedKey || connecting) return;
		connecting = true;
		connectError = null;

		const result = await new ForestryApi(trimmedKey).getPageInfoResult();
		connecting = false;

		if (!result.ok) {
			connectError =
				result.kind === "unauthorized"
					? "That Garden Key didn't work. Copy it again from your garden's page on the Forestry.md dashboard."
					: "Couldn't reach Forestry.md. Check your internet connection and try again.";

			return;
		}
		const pageInfo = result.value;
		settings.forestrySettings.forestryPageName = pageInfo.value.pageName;
		settings.forestrySettings.baseUrl = pageInfo.value.baseUrl;
		settings.forestrySettings.apiKey = trimmedKey;
		await saveSettings();

		new Notice(
			`Connected to your Forestry.md garden ${pageInfo.value.pageName}.`,
		);
		await onConnect();
		afterConnect?.();
	};

	const disconnect = async () => {
		settings.forestrySettings.apiKey = "";
		settings.forestrySettings.forestryPageName = "";
		await saveSettings();
		apiKey = "";
		limits = null;
		confirmingDisconnect = false;
		await onConnect();
	};

	const getPageInfo = (_attempt: number) =>
		new ForestryApi(settings.forestrySettings.apiKey).getPageInfo();

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

	$: atLimit =
		!!limits &&
		(limits.builds.monthlyRemaining === 0 ||
			limits.storage.usedBytes >= limits.storage.limitBytes);
</script>

<div class="dg-forestry">
	<div class="setting-item setting-item-heading">
		<div class="setting-item-info">
			<div class="setting-item-name">Forestry.md connection</div>
		</div>
	</div>

	{#if !settings.forestrySettings.apiKey}
		<div class="setting-item">
			<div class="setting-item-info">
				<label class="setting-item-name" for="dg-garden-key-{uid}"
					>Garden Key</label
				>
				<div
					class="setting-item-description"
					id="dg-garden-key-desc-{uid}"
				>
					Find it on your garden's page in the
					<a href="https://dashboard.forestry.md"
						>Forestry.md dashboard</a
					>. Its "Connect Obsidian" button fills this in for you.
				</div>
			</div>
			<div class="setting-item-control">
				<input
					id="dg-garden-key-{uid}"
					class="dg-secret-input"
					type={showKey ? "text" : "password"}
					autocomplete="off"
					spellcheck="false"
					aria-describedby="dg-garden-key-desc-{uid}"
					value={apiKey}
					on:input={(e) => (apiKey = e.currentTarget.value)}
					on:keydown={(e) => e.key === "Enter" && connect()}
				/>
				<button
					class="clickable-icon"
					aria-label={showKey ? "Hide Garden Key" : "Show Garden Key"}
					aria-pressed={showKey}
					on:click={() => (showKey = !showKey)}
				>
					<Icon name={showKey ? "eye-off" : "eye"} />
				</button>
				<button
					class="mod-cta"
					on:click={connect}
					disabled={connecting || !apiKey.trim()}
					>{connecting ? "Connecting…" : "Connect"}</button
				>
			</div>
		</div>
		{#if connectError}
			<p class="dg-forestry-message" role="alert">
				<Icon name="alert-circle" />
				{connectError}
			</p>
		{/if}
	{:else}
		{#await getPageInfo(attempt)}
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-description" role="status">
						Checking your Forestry.md connection…
					</div>
				</div>
			</div>
		{:then pageInfo}
			{#if pageInfo}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name dg-forestry-connected">
							<Icon name="check-circle" />
							Connected to {pageInfo.value.pageName ??
								"your garden"}
						</div>
						<div class="setting-item-description">
							Publish from the Publication Center.
							<a href="https://dashboard.forestry.md"
								>Open dashboard</a
							>
						</div>
					</div>
					<div class="setting-item-control">
						<button on:click={() => (confirmingDisconnect = true)}
							>Disconnect</button
						>
					</div>
				</div>
			{:else}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">
							Couldn't reach Forestry.md
						</div>
						<div class="setting-item-description">
							Your garden is still connected. Check your internet
							connection, then try again.
						</div>
					</div>
					<div class="setting-item-control">
						<button on:click={() => attempt++}>Try again</button>
						<button on:click={() => (confirmingDisconnect = true)}
							>Disconnect</button
						>
					</div>
				</div>
			{/if}
		{:catch}
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-name">
						Couldn't reach Forestry.md
					</div>
					<div class="setting-item-description">
						Your garden is still connected. Check your internet
						connection, then try again.
					</div>
				</div>
				<div class="setting-item-control">
					<button on:click={() => attempt++}>Try again</button>
					<button on:click={() => (confirmingDisconnect = true)}
						>Disconnect</button
					>
				</div>
			</div>
		{/await}

		{#if confirmingDisconnect}
			<div
				class="dg-forestry-confirm"
				role="alertdialog"
				aria-labelledby="dg-disconnect-{uid}"
			>
				<p id="dg-disconnect-{uid}">
					Disconnect this vault from Forestry.md? Your site stays
					online, but you can't publish from this vault until you
					connect it again with your Garden Key.
				</p>
				<div class="dg-forestry-confirm-actions">
					<button on:click={() => (confirmingDisconnect = false)}
						>Cancel</button
					>
					<button class="mod-warning" on:click={disconnect}
						>Disconnect</button
					>
				</div>
			</div>
		{/if}

		{#if limitsLoading}
			<p class="dg-forestry-muted" role="status">Loading your usage…</p>
		{:else if limits}
			<div class="setting-item setting-item-heading">
				<div class="setting-item-info">
					<div class="setting-item-name">
						Usage on the {limits.plan} plan
					</div>
				</div>
			</div>
			<dl class="dg-forestry-usage">
				<dt>Publishes this month</dt>
				<dd>
					{limits.builds.monthlyLimit -
						limits.builds.monthlyRemaining} of
					{limits.builds.monthlyLimit}
				</dd>
				{#if limits.builds.starterCreditsRemaining > 0}
					<dt>Starter credits left</dt>
					<dd>{limits.builds.starterCreditsRemaining}</dd>
				{/if}
				<dt>Storage</dt>
				<dd>
					{limits.storage.usedFormatted} of {limits.storage
						.limitFormatted}
				</dd>
				<dt>Sites</dt>
				<dd>{limits.sites.current} of {limits.sites.limit}</dd>
			</dl>
			{#if atLimit}
				<p class="dg-forestry-limit" role="alert">
					<Icon name="alert-triangle" />
					<span>
						You've reached your plan's limit, so publishing is
						paused.
						<a href="https://dashboard.forestry.md/settings"
							>Upgrade your plan</a
						> to keep publishing.
					</span>
				</p>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.dg-secret-input {
		width: 16rem;
		max-width: 100%;
	}

	.dg-forestry-connected {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.dg-forestry-connected :global(.svg-icon) {
		color: var(--text-success);
	}

	.dg-forestry-message,
	.dg-forestry-muted,
	.dg-forestry-usage {
		padding-inline: var(--size-4-4);
	}

	.dg-forestry-message {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 6px 0;
		font-size: var(--font-ui-small);
	}

	.dg-forestry-message :global(.svg-icon) {
		flex: 0 0 auto;
		color: var(--text-error);
	}

	.dg-forestry-confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin: 4px 0 12px;
		padding: 10px 12px;
		border: 1px solid
			color-mix(in srgb, var(--text-warning) 45%, transparent);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--text-warning) 10%, transparent);
		font-size: var(--font-ui-small);
	}

	.dg-forestry-confirm p {
		flex: 1 1 18rem;
		margin: 0;
	}

	.dg-forestry-confirm-actions {
		display: flex;
		gap: 8px;
	}

	.dg-forestry-muted {
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.dg-forestry-usage {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 16px;
		margin: 0 0 12px;
		font-size: var(--font-ui-small);
	}

	.dg-forestry-usage dt {
		color: var(--text-muted);
	}

	.dg-forestry-usage dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.dg-forestry-limit {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 12px;
		padding: 10px 12px;
		border: 1px solid
			color-mix(in srgb, var(--text-warning) 45%, transparent);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--text-warning) 10%, transparent);
		font-size: var(--font-ui-small);
	}

	.dg-forestry-limit :global(.svg-icon) {
		flex: 0 0 auto;
		color: var(--text-warning);
	}
</style>
