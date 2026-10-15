<script lang="ts">
	import type DigitalGardenSettings from "../../models/settings";

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let onEnabled: () => void;

	let saving = false;

	async function enable() {
		saving = true;
		settings.gardenCommunityPluginsEnabled = true;
		await saveSettings();
		saving = false;
		onEnabled();
	}
</script>

<div class="dg-community-gate">
	<p class="dg-community-gate-title">Community plugins are turned off</p>

	<p>
		Community plugins are made by third-party developers, not by Digital
		Garden. They run their own code in your site's build and in your
		visitors' browsers, and are not reviewed for security.
	</p>

	<p>
		Only install plugins from authors you trust. Turning community plugins
		on lets you install them without confirming each one. You can turn them
		off again at any time.
	</p>

	<button class="mod-cta" disabled={saving} on:click={enable}
		>Turn on community plugins</button
	>
</div>

<style>
	.dg-community-gate {
		border: 1px solid var(--background-modifier-border);
		border-left: 3px solid var(--text-warning, var(--interactive-accent));
		border-radius: 8px;
		padding: 12px 16px;
		margin-top: 8px;
	}

	.dg-community-gate p {
		margin: 0 0 10px;
		color: var(--text-muted);
	}

	.dg-community-gate .dg-community-gate-title {
		color: var(--text-normal);
		font-weight: 600;
	}
</style>
