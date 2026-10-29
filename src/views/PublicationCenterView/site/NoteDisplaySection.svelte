<!-- src/views/PublicationCenterView/site/NoteDisplaySection.svelte -->
<script lang="ts">
	import SiteRow from "./SiteRow.svelte";
	import { getSiteContext } from "./siteContext";
	import { toggle } from "./obsidianControls";
	import type DigitalGardenSettings from "../../../models/settings";
	import { DateTime } from "luxon";

	const { settings, edit, changes } = getSiteContext();

	type NoteKey = keyof DigitalGardenSettings["defaultNoteSettings"];

	// Each default can be overridden per note with the frontmatter key.
	const NOTE_DEFAULTS: {
		key: NoteKey;
		group: "note" | "sidebar" | "advanced";
		fm: string;
		name: string;
		desc: string;
	}[] = [
		{
			key: "dgHomeLink",
			group: "note",
			fm: "dg-home-link",
			name: "Home link",
			desc: "A link back to your home page.",
		},
		{
			key: "dgShowLocalGraph",
			group: "sidebar",
			fm: "dg-show-local-graph",
			name: "Local graph",
			desc: "The note's connections, in a sidebar on desktop and below the note on phones.",
		},
		{
			key: "dgShowGraphDepthControl",
			group: "sidebar",
			fm: "dg-show-graph-depth-control",
			name: "Graph depth slider",
			desc: "A slider to show more or fewer levels in the graph.",
		},
		{
			key: "dgShowBacklinks",
			group: "sidebar",
			fm: "dg-show-backlinks",
			name: "Backlinks",
			desc: "Notes that link to this one, in a sidebar on desktop and below the note on phones.",
		},
		{
			key: "dgShowToc",
			group: "sidebar",
			fm: "dg-show-toc",
			name: "Table of contents",
			desc: "The note's headings in a sidebar. Desktop only.",
		},
		{
			key: "dgShowInlineTitle",
			group: "note",
			fm: "dg-show-inline-title",
			name: "Inline title",
			desc: "The note's title above its content.",
		},
		{
			key: "dgShowFileTree",
			group: "sidebar",
			fm: "dg-show-file-tree",
			name: "File tree",
			desc: "A sidebar listing your published notes.",
		},
		{
			key: "dgShowTags",
			group: "note",
			fm: "dg-show-tags",
			name: "Tags",
			desc: "The note's tags. With search on, a tag opens a search for it.",
		},
		{
			key: "dgPassFrontmatter",
			group: "advanced",
			fm: "dg-pass-frontmatter",
			name: "Pass all frontmatter",
			desc: "Sends every frontmatter property to the site template. Values the template can't read will break the build; turn this off again to fix it.",
		},
	];

	const setNote = (key: NoteKey) => async (value: boolean) => {
		settings.defaultNoteSettings[key] = value;
		await edit();
	};

	type BoolKey =
		| "showCreatedTimestamp"
		| "showUpdatedTimestamp"
		| "showNoteIconOnTitle"
		| "showNoteIconInFileTree"
		| "showNoteIconOnInternalLink"
		| "showNoteIconOnBackLink";

	const setBool = (key: BoolKey) => async (value: boolean) => {
		settings[key] = value;
		await edit();
	};

	const ICON_ROWS: { id: string; key: BoolKey; name: string }[] = [
		{
			id: "NOTE_ICON_TITLE",
			key: "showNoteIconOnTitle",
			name: "Icon on titles",
		},
		{
			id: "NOTE_ICON_FILETREE",
			key: "showNoteIconInFileTree",
			name: "Icon in the file tree",
		},
		{
			id: "NOTE_ICON_INTERNAL_LINKS",
			key: "showNoteIconOnInternalLink",
			name: "Icon on internal links",
		},
		{
			id: "NOTE_ICON_BACK_LINKS",
			key: "showNoteIconOnBackLink",
			name: "Icon on backlinks",
		},
	];

	const inGroup = (group: (typeof NOTE_DEFAULTS)[number]["group"]) =>
		NOTE_DEFAULTS.filter((item) => item.group === group);

	// A live example of the date format, so the tokens needn't be known.
	let dateFormat = settings.timestampFormat;

	$: datePreview = (() => {
		if (!dateFormat.trim()) return "";

		try {
			return DateTime.now().toFormat(dateFormat);
		} catch {
			return "";
		}
	})();

	const setText = (apply: (value: string) => void) => async (e: Event) => {
		apply((e.currentTarget as HTMLInputElement).value);
		await edit();
	};
</script>

<p class="dg-site-intro">
	Defaults for every published note. Override one per note with the
	frontmatter key shown under each setting.
	<a href="https://docs.forestry.md/getting-started/03-note-settings/"
		>Note settings guide</a
	>
</p>

{#each [{ id: "note", title: "On the note" }, { id: "sidebar", title: "Sidebars" }] as const as group (group.id)}
	<h3 class="dg-site-subheading">{group.title}</h3>
	{#each inGroup(group.id) as item (item.key)}
		<SiteRow id={item.key} name={item.name} description={item.desc}>
			<code slot="hint" class="dg-site-fm">{item.fm}</code>
			<div
				use:toggle={{
					value: settings.defaultNoteSettings[item.key],
					label: item.name,
					onChange: setNote(item.key),
				}}
			></div>
		</SiteRow>
	{/each}
{/each}

<h3 class="dg-site-subheading">Dates</h3>

<SiteRow id="SHOW_CREATED_TIMESTAMP" name="Created date">
	<div
		use:toggle={{
			value: settings.showCreatedTimestamp,
			label: "Created date",
			onChange: setBool("showCreatedTimestamp"),
		}}
	></div>
</SiteRow>

<SiteRow id="SHOW_UPDATED_TIMESTAMP" name="Updated date">
	<div
		use:toggle={{
			value: settings.showUpdatedTimestamp,
			label: "Updated date",
			onChange: setBool("showUpdatedTimestamp"),
		}}
	></div>
</SiteRow>

<SiteRow
	id="TIMESTAMP_FORMAT"
	name="Date format"
	description="How dates are written, e.g. MMM dd, yyyy for Oct 26, 2026."
>
	<input
		type="text"
		aria-label="Date format"
		value={settings.timestampFormat}
		on:input={setText((v) => (settings.timestampFormat = dateFormat = v))}
	/>
	<svelte:fragment slot="hint">
		{#if datePreview}
			<p class="dg-site-preview" aria-live="polite">
				Today would show as <strong>{datePreview}</strong>
			</p>
		{/if}
	</svelte:fragment>
</SiteRow>

<h3 class="dg-site-subheading">Note icons</h3>

<SiteRow
	id="NOTE_ICON_DEFAULT"
	name="Default note icon"
	description="Used when a note doesn't set its own. 1, 2 or 3 picks one of the template's tree icons, from sapling to full tree; other values need your own CSS."
>
	<input
		type="text"
		aria-label="Default note icon"
		value={settings.defaultNoteIcon}
		on:input={setText((v) => (settings.defaultNoteIcon = v))}
	/>
</SiteRow>

{#each ICON_ROWS as row (row.id)}
	<SiteRow id={row.id} name={row.name}>
		<div
			use:toggle={{
				value: settings[row.key],
				label: row.name,
				onChange: setBool(row.key),
			}}
		></div>
	</SiteRow>
{/each}

<details
	class="dg-site-advanced"
	open={settings.defaultNoteSettings.dgPassFrontmatter ||
		$changes.has("dgPassFrontmatter")}
>
	<summary>Advanced</summary>
	{#each inGroup("advanced") as item (item.key)}
		<SiteRow id={item.key} name={item.name} description={item.desc}>
			<code slot="hint" class="dg-site-fm">{item.fm}</code>
			<div
				use:toggle={{
					value: settings.defaultNoteSettings[item.key],
					label: item.name,
					onChange: setNote(item.key),
				}}
			></div>
		</SiteRow>
	{/each}
</details>

<style>
	.dg-site-intro {
		margin: 0 0 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.dg-site-preview {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-site-preview strong {
		color: var(--text-normal);
		font-weight: var(--font-medium);
	}

	.dg-site-advanced {
		margin-top: 20px;
	}

	.dg-site-advanced > summary {
		margin-bottom: 4px;
		font-size: var(--font-ui-medium);
		font-weight: var(--font-semibold);
		cursor: pointer;
	}

	.dg-site-subheading {
		margin: 20px 0 4px;
		font-size: var(--font-ui-medium);
		font-weight: var(--font-semibold);
	}
</style>
