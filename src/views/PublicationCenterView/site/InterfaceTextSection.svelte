<!-- src/views/PublicationCenterView/site/InterfaceTextSection.svelte -->
<script lang="ts">
	import SiteRow from "./SiteRow.svelte";
	import { getSiteContext } from "./siteContext";
	import { SITE_FIELDS, UI_TEXT_SETTINGS } from "./siteFields";

	const { settings, edit } = getSiteContext();

	// The template's built-in wording, shown as the placeholder.
	const DEFAULTS: Record<string, string> = {
		UI_BACKLINK_HEADER: "Pages mentioning this page",
		UI_NO_BACKLINKS_MESSAGE: "No other pages mentions this page",
		UI_SEARCH_BUTTON_TEXT: "Search",
		UI_SEARCH_PLACEHOLDER: "Start typing...",
		UI_SEARCH_NOT_STARTED_TEXT: "Enter your search text in the box above",
		UI_SEARCH_NO_RESULTS: "No results for",
		UI_SEARCH_PREVIEW_PLACEHOLDER: "Select a result to preview",
		UI_SEARCH_ENTER_HINT: "Enter to select",
		UI_SEARCH_ENTER_HOTKEY: "Enter",
		UI_SEARCH_NAVIGATE_HINT: "to navigate",
		UI_SEARCH_NAVIGATE_HOTKEY: "⇅",
		UI_SEARCH_CLOSE_HINT: "ESC to close",
		UI_SEARCH_CLOSE_HOTKEY: "ESC",
		UI_CANVAS_DRAG_HINT: "Drag to pan",
		UI_CANVAS_ZOOM_HINT: "Scroll to zoom",
		UI_CANVAS_RESET_HINT: "Double-click to reset",
	};

	const GROUPS: { title: string; prefix: string }[] = [
		{ title: "Backlinks", prefix: "UI_BACKLINK|UI_NO_BACKLINKS" },
		{ title: "Search", prefix: "UI_SEARCH" },
		{ title: "Canvas", prefix: "UI_CANVAS" },
	];

	const fields = SITE_FIELDS.filter((f) => f.section === "uiText");

	// Labels for the keys in the search dialog's footer; rarely changed.
	const KEY_HINTS = new Set([
		"UI_SEARCH_ENTER_HINT",
		"UI_SEARCH_ENTER_HOTKEY",
		"UI_SEARCH_NAVIGATE_HINT",
		"UI_SEARCH_NAVIGATE_HOTKEY",
		"UI_SEARCH_CLOSE_HINT",
		"UI_SEARCH_CLOSE_HOTKEY",
	]);

	const inGroup = (prefix: string) =>
		fields.filter(
			(f) =>
				new RegExp(`^(${prefix})`).test(f.id) && !KEY_HINTS.has(f.id),
		);

	const keyHintFields = fields.filter((f) => KEY_HINTS.has(f.id));
	const keyHintsChanged = keyHintFields.some(
		(f) => !!settings.uiStrings?.[UI_TEXT_SETTINGS[f.id]],
	);

	async function set(id: string, e: Event) {
		settings.uiStrings[UI_TEXT_SETTINGS[id]] = (
			e.currentTarget as HTMLInputElement
		).value;
		await edit();
	}
</script>

<p class="dg-site-intro">
	Change the wording your site uses, for example to translate it. Leave a
	field empty to keep the default.
</p>

{#each GROUPS as group (group.title)}
	<h3 class="dg-site-subheading">{group.title}</h3>
	{#each inGroup(group.prefix) as field (field.id)}
		<SiteRow
			id={field.id}
			name={field.label}
			description="Default: {DEFAULTS[field.id]}"
		>
			<input
				type="text"
				class="dg-ui-text-input"
				aria-label={field.label}
				placeholder={DEFAULTS[field.id]}
				value={settings.uiStrings?.[UI_TEXT_SETTINGS[field.id]] ?? ""}
				on:input={(e) => set(field.id, e)}
			/>
		</SiteRow>
	{/each}
	{#if group.prefix === "UI_SEARCH"}
		<details class="dg-site-keyhints" open={keyHintsChanged}>
			<summary>Keyboard hints in the search dialog</summary>
			{#each keyHintFields as field (field.id)}
				<SiteRow
					id={field.id}
					name={field.label}
					description="Default: {DEFAULTS[field.id]}"
				>
					<input
						type="text"
						class="dg-ui-text-input"
						aria-label={field.label}
						placeholder={DEFAULTS[field.id]}
						value={settings.uiStrings?.[
							UI_TEXT_SETTINGS[field.id]
						] ?? ""}
						on:input={(e) => set(field.id, e)}
					/>
				</SiteRow>
			{/each}
		</details>
	{/if}
{/each}

<style>
	.dg-site-intro {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	/* Wide enough to read the default wording in full. */
	.dg-ui-text-input {
		width: 22rem;
		max-width: 100%;
	}

	.dg-site-keyhints {
		margin: 8px 0;
	}

	.dg-site-keyhints > summary {
		padding: 6px 0;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		cursor: pointer;
	}

	.dg-site-subheading {
		margin: 20px 0 4px;
		font-size: var(--font-ui-medium);
		font-weight: var(--font-semibold);
	}
</style>
