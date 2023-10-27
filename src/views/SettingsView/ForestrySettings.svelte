<script lang="ts">
	import { auth0 } from "src/authentication/auth0";
	import DigitalGardenSettings from "../../models/settings";
	import ForestryApi from "src/forestry/ForestryApi";
	import { Notice } from "obsidian";

	let unique = {};

	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	const login = async () => {
		await auth0.loginWithRedirect();
	};

	const logout = async () => {
		await auth0.logout();
		unique = {};
	};

	let forestyPageName: string = settings.forestryPageName;

	const savePageName = async () => {
		settings.forestryPageName = forestyPageName;
		await saveSettings();
	};

	const createPage = async () => {
		let isSuccess = await new ForestryApi().createPage(
			settings.forestryPageName,
		);
		if (isSuccess) {
			new Notice("Page created successfully");
		} else {
			new Notice("Page creation failed");
		}
	};
</script>

<div>
	{#key unique}
		{#await auth0.isAuthenticated()}
			<div>Retrieving user info...</div>
		{:then isAuthenticated}
			{#if isAuthenticated}
				{#await auth0.getUser()}
					<div>Retrieving user info...</div>
				{:then user}
					<div>Logged in as {user?.nickname ?? "Unknown"}</div>
				{/await}

				<input type="text" bind:value={forestyPageName} />
				<button on:click={savePageName}>Save Page Name</button>

				<button on:click={createPage}>TODO: Create page</button>
				<button on:click={logout}>Log out</button>
			{:else}
				<button on:click={login}>Login/Sign Up</button>
			{/if}
		{:catch error}
			<div>Error: {error.message}</div>
		{/await}
	{/key}
</div>
