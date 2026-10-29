<!-- src/views/PublicationCenterView/site/SiteTab.svelte -->
<script lang="ts">
	import Icon from "../../../ui/Icon.svelte";
	import AppearanceSection from "./AppearanceSection.svelte";
	import NoteDisplaySection from "./NoteDisplaySection.svelte";
	import InterfaceTextSection from "./InterfaceTextSection.svelte";
	import AddressSection from "./AddressSection.svelte";
	import NavigationSection from "./NavigationSection.svelte";
	import PluginsSection from "./PluginsSection.svelte";
	import { getSiteContext } from "./siteContext";
	import { SECTION_LABEL } from "./siteFields";
	import type { SiteTabSection } from "./target";

	export let loading: boolean;
	export let error: string | null;
	export let onRetry: () => void;
	/** The section shown; set from outside to open a specific one. */
	export let active: SiteTabSection = "appearance";
	/** Community plugin to select under Plugins. */
	export let pluginId: string | undefined = undefined;
	/** Bumped when values change outside the form (pulled from the site, Revert). */
	export let formVersion: number;

	const { changes } = getSiteContext();

	const SECTIONS: { id: SiteTabSection; icon: string; label: string }[] = [
		{ id: "appearance", icon: "palette", label: SECTION_LABEL.appearance },
		{
			id: "noteDisplay",
			icon: "layout-template",
			label: SECTION_LABEL.noteDisplay,
		},
		{ id: "uiText", icon: "languages", label: SECTION_LABEL.uiText },
		{ id: "address", icon: "link", label: SECTION_LABEL.address },
		{ id: "navigation", icon: "list-tree", label: "Navigation" },
		{ id: "plugins", icon: "blocks", label: SECTION_LABEL.plugins },
	];

	// In the narrow scrolling row, keep the open section in view.
	function revealWhenActive(el: HTMLElement, isActive: boolean) {
		const reveal = (on: boolean) => {
			if (on) el.scrollIntoView({ block: "nearest", inline: "nearest" });
		};
		reveal(isActive);

		return { update: reveal };
	}

	$: countFor = (id: SiteTabSection) =>
		[...$changes.values()].filter((c) => c.section === id).length;
</script>

<div class="dg-site">
	<nav class="dg-site-nav" aria-label="Site settings">
		{#each SECTIONS as section (section.id)}
			<button
				class="dg-site-nav-item"
				class:is-active={active === section.id}
				use:revealWhenActive={active === section.id}
				aria-current={active === section.id ? "page" : undefined}
				on:click={() => (active = section.id)}
			>
				<Icon name={section.icon} />
				<span class="dg-site-nav-label">{section.label}</span>
				{#if countFor(section.id) > 0}
					<span class="dg-site-nav-count">{countFor(section.id)}</span
					><span class="dg-sr-only"> not published</span>
				{/if}
			</button>
		{/each}
	</nav>

	<div class="dg-site-pane">
		{#if loading}
			<p class="dg-site-status" role="status">
				Reading your site's current settings…
			</p>
		{:else if error}
			<div class="dg-site-error" role="alert">
				<p>
					Couldn't read your site's current settings, so changes can't
					be compared or published yet. {error}
				</p>
				<button on:click={onRetry}>Try again</button>
			</div>
		{/if}

		<h2 class="dg-site-title">
			{SECTIONS.find((s) => s.id === active)?.label}
		</h2>

		<!-- Read-only until the site's values are in, so they can't
		     overwrite what's being typed. -->
		<div class="dg-site-form" inert={loading} aria-busy={loading}>
			{#key formVersion}
				{#if active === "appearance"}
					<AppearanceSection />
				{:else if active === "noteDisplay"}
					<NoteDisplaySection />
				{:else if active === "uiText"}
					<InterfaceTextSection />
				{:else if active === "address"}
					<AddressSection />
				{:else if active === "navigation"}
					<NavigationSection />
				{:else}
					<PluginsSection {pluginId} />
				{/if}
			{/key}
		</div>
	</div>
</div>

<style>
	.dg-site {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.dg-site-nav {
		flex: 0 0 13rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		border-right: 1px solid var(--background-modifier-border);
		overflow-y: auto;
	}

	.dg-site-nav-item {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		width: 100%;
		height: auto;
		padding: 6px 8px;
		background: none;
		border: none;
		box-shadow: none;
		border-radius: var(--radius-s);
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		text-align: left;
		cursor: pointer;
	}

	/* No hover on touch screens, where it sticks after a tap. */
	@media (hover: hover) {
		.dg-site-nav-item:hover {
			background: var(--background-modifier-hover);
			color: var(--text-normal);
		}
	}

	.dg-site-nav-item.is-active {
		background: var(--background-modifier-active-hover);
		color: var(--text-normal);
		font-weight: var(--font-semibold);
	}

	.dg-site-nav-item :global(.svg-icon) {
		width: 16px;
		height: 16px;
		flex: 0 0 auto;
	}

	.dg-site-nav-label {
		flex: 1;
	}

	.dg-site-nav-count {
		min-width: 1.4em;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--background-modifier-border);
		color: var(--text-normal);
		font-size: var(--font-ui-smaller);
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.dg-site-pane {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 8px 16px 16px;
	}

	.dg-site-form[inert] {
		opacity: 0.6;
	}

	.dg-site-title {
		margin: 4px 0 8px;
		font-size: var(--font-ui-large);
		font-weight: var(--font-semibold);
	}

	.dg-site-status {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.dg-site-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 12px;
		margin-bottom: 10px;
		padding: 10px;
		border: 1px solid
			color-mix(in srgb, var(--text-warning) 45%, transparent);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--text-warning) 10%, transparent);
		font-size: var(--font-ui-small);
	}

	.dg-site-error p {
		flex: 1 1 16rem;
		margin: 0;
	}

	/* Narrow: sections become one scrolling row above the form, so they
	   take a single line of the screen. */
	@container (max-width: 640px) {
		.dg-site {
			flex-direction: column;
		}

		.dg-site-nav {
			flex: 0 0 auto;
			flex-direction: row;
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			padding: 6px var(--size-4-4);
			border-right: none;
			border-bottom: 1px solid var(--background-modifier-border);
		}

		.dg-site-nav::-webkit-scrollbar {
			display: none;
		}

		.dg-site-nav-item {
			flex: 0 0 auto;
			width: auto;
			white-space: nowrap;
		}

		.dg-site-pane {
			padding: 8px var(--size-4-4) 16px;
		}
	}
</style>
