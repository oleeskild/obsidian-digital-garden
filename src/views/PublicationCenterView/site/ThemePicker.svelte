<!-- src/views/PublicationCenterView/site/ThemePicker.svelte -->
<script lang="ts">
	import { getSiteContext } from "./siteContext";
	import { DEFAULT_THEME_VALUE } from "./siteFields";
	import type { PickableTheme } from "./themes";

	export let themes: PickableTheme[];
	export let loading: boolean;
	export let error: boolean;
	export let onRetry: () => void;
	/** Runs after a pick is saved, e.g. to update the light/dark control. */
	export let onPick: () => void = () => {};

	const { settings, edit } = getSiteContext();

	// Unique per instance; radio groups need a shared name.
	const group = `dg-theme-${Math.random().toString(36).slice(2)}`;

	let query = "";
	// Themes whose preview image didn't load show "No preview" instead.
	let failed = new Set<string>();
	let current = JSON.parse(settings.theme) as { cssUrl?: string };

	$: matches = themes.filter((t) =>
		t.name.toLowerCase().includes(query.trim().toLowerCase()),
	);
	$: showDefault = "default".includes(query.trim().toLowerCase());

	async function pick(theme: PickableTheme | null) {
		settings.theme = theme
			? JSON.stringify({
					name: theme.name,
					repo: theme.repo,
					modes: theme.modes,
					cssUrl: theme.cssUrl,
			  })
			: DEFAULT_THEME_VALUE;
		current = JSON.parse(settings.theme);

		// A theme with one mode can only be published in that mode.
		const modes = theme?.modes ?? [];

		if (modes.length > 0 && !modes.includes(settings.baseTheme)) {
			settings.baseTheme = modes[0];
		}
		await edit();
		onPick();
	}
</script>

<div class="dg-theme-picker">
	<input
		type="search"
		class="dg-theme-search"
		placeholder="Search themes"
		aria-label="Search themes"
		bind:value={query}
	/>

	{#if loading}
		<p class="dg-theme-note">Loading Obsidian's theme list…</p>
	{:else if error}
		<p class="dg-theme-note">
			Couldn't load the theme list.
			<button on:click={onRetry}>Try again</button>
		</p>
	{/if}

	{#if !loading && !error && matches.length === 0 && !showDefault}
		<p class="dg-theme-note" role="status">
			No themes match “{query.trim()}”.
		</p>
	{/if}

	<div class="dg-theme-grid" role="radiogroup" aria-label="Theme">
		{#if showDefault}
			<label class="dg-theme-card" class:is-selected={!current.cssUrl}>
				<input
					type="radio"
					class="dg-sr-only"
					name={group}
					checked={!current.cssUrl}
					on:change={() => pick(null)}
				/>
				<span class="dg-theme-card-image dg-theme-card-placeholder"
					>Template default</span
				>
				<span class="dg-theme-card-name">Default</span>
			</label>
		{/if}
		{#each matches as theme (theme.cssUrl)}
			<label
				class="dg-theme-card"
				class:is-selected={current.cssUrl === theme.cssUrl}
			>
				<input
					type="radio"
					class="dg-sr-only"
					name={group}
					checked={current.cssUrl === theme.cssUrl}
					on:change={() => pick(theme)}
				/>
				{#if failed.has(theme.cssUrl)}
					<span class="dg-theme-card-image dg-theme-card-placeholder"
						>No preview</span
					>
				{:else}
					<span class="dg-theme-card-image">
						<img
							src={theme.screenshotUrl}
							alt=""
							loading="lazy"
							on:error={() =>
								(failed = new Set(failed).add(theme.cssUrl))}
						/>
					</span>
				{/if}
				<span class="dg-theme-card-name">{theme.name}</span>
			</label>
		{/each}
	</div>
</div>

<style>
	.dg-theme-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}

	.dg-theme-search {
		width: 100%;
	}

	.dg-theme-note {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.dg-theme-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		gap: 10px;
	}

	.dg-theme-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		overflow: hidden;
		background: var(--background-secondary);
		cursor: pointer;
	}

	.dg-theme-card:hover {
		border-color: var(--background-modifier-border-hover);
	}

	.dg-theme-card.is-selected {
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 1px var(--interactive-accent);
	}

	.dg-theme-card:focus-within {
		box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
	}

	.dg-theme-card-image {
		display: block;
		height: 76px;
		background: var(--background-primary);
		overflow: hidden;
	}

	.dg-theme-card-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.dg-theme-card-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-theme-card-name {
		padding: 6px 8px;
		font-size: var(--font-ui-smaller);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
