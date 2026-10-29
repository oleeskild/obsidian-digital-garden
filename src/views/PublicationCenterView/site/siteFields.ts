import type DigitalGardenSettings from "../../../models/settings";

export type SiteSection =
	| "appearance"
	| "noteDisplay"
	| "uiText"
	| "address"
	| "plugins";

export const SECTION_LABEL: Record<SiteSection, string> = {
	appearance: "Appearance",
	noteDisplay: "Note display",
	uiText: "Interface text",
	address: "Site address",
	plugins: "Plugins",
};

/**
 * One reviewable site setting. Most map to a single .env key; Style
 * Settings is two keys that only make sense together.
 */
export interface SiteFieldDef {
	id: string;
	keys: string[];
	section: SiteSection;
	label: string;
	kind: "text" | "bool" | "theme" | "styleSettings";
	/** Only applies to self-hosted gardens. */
	selfHostedOnly?: boolean;
}

type NoteSettingKey = keyof DigitalGardenSettings["defaultNoteSettings"];
type UiStringKey = keyof DigitalGardenSettings["uiStrings"];

const noteToggle = (
	key: NoteSettingKey,
	label: string,
	section: SiteSection = "noteDisplay",
): SiteFieldDef => ({ id: key, keys: [key], section, label, kind: "bool" });

const uiText = (key: string, label: string): SiteFieldDef => ({
	id: key,
	keys: [key],
	section: "uiText",
	label,
	kind: "text",
});

export const SITE_FIELDS: SiteFieldDef[] = [
	{
		id: "THEME",
		keys: ["THEME"],
		section: "appearance",
		label: "Theme",
		kind: "theme",
	},
	{
		id: "BASE_THEME",
		keys: ["BASE_THEME"],
		section: "appearance",
		label: "Light or dark",
		kind: "text",
	},
	{
		id: "SITE_NAME_HEADER",
		keys: ["SITE_NAME_HEADER"],
		section: "appearance",
		label: "Site name",
		kind: "text",
	},
	{
		id: "LOGO_HEIGHT",
		keys: ["LOGO_HEIGHT"],
		section: "appearance",
		label: "Logo size",
		kind: "text",
	},
	{
		id: "SITE_MAIN_LANGUAGE",
		keys: ["SITE_MAIN_LANGUAGE"],
		section: "appearance",
		label: "Main language",
		kind: "text",
	},
	{
		id: "USE_FULL_RESOLUTION_IMAGES",
		keys: ["USE_FULL_RESOLUTION_IMAGES"],
		section: "appearance",
		label: "Full resolution images",
		kind: "bool",
	},
	{
		id: "styleSettings",
		keys: ["STYLE_SETTINGS_CSS", "STYLE_SETTINGS_BODY_CLASSES"],
		section: "appearance",
		label: "Style Settings",
		kind: "styleSettings",
	},

	noteToggle("dgHomeLink", "Home link"),
	noteToggle("dgShowLocalGraph", "Local graph"),
	noteToggle("dgShowGraphDepthControl", "Graph depth slider"),
	noteToggle("dgShowBacklinks", "Backlinks"),
	noteToggle("dgShowToc", "Table of contents"),
	noteToggle("dgShowInlineTitle", "Inline title"),
	noteToggle("dgShowFileTree", "File tree"),
	noteToggle("dgShowTags", "Tags"),
	noteToggle("dgPassFrontmatter", "Pass all frontmatter"),
	{
		id: "SHOW_CREATED_TIMESTAMP",
		keys: ["SHOW_CREATED_TIMESTAMP"],
		section: "noteDisplay",
		label: "Created date",
		kind: "bool",
	},
	{
		id: "SHOW_UPDATED_TIMESTAMP",
		keys: ["SHOW_UPDATED_TIMESTAMP"],
		section: "noteDisplay",
		label: "Updated date",
		kind: "bool",
	},
	{
		id: "TIMESTAMP_FORMAT",
		keys: ["TIMESTAMP_FORMAT"],
		section: "noteDisplay",
		label: "Date format",
		kind: "text",
	},
	{
		id: "NOTE_ICON_DEFAULT",
		keys: ["NOTE_ICON_DEFAULT"],
		section: "noteDisplay",
		label: "Default note icon",
		kind: "text",
	},
	{
		id: "NOTE_ICON_TITLE",
		keys: ["NOTE_ICON_TITLE"],
		section: "noteDisplay",
		label: "Icon on titles",
		kind: "bool",
	},
	{
		id: "NOTE_ICON_FILETREE",
		keys: ["NOTE_ICON_FILETREE"],
		section: "noteDisplay",
		label: "Icon in the file tree",
		kind: "bool",
	},
	{
		id: "NOTE_ICON_INTERNAL_LINKS",
		keys: ["NOTE_ICON_INTERNAL_LINKS"],
		section: "noteDisplay",
		label: "Icon on internal links",
		kind: "bool",
	},
	{
		id: "NOTE_ICON_BACK_LINKS",
		keys: ["NOTE_ICON_BACK_LINKS"],
		section: "noteDisplay",
		label: "Icon on backlinks",
		kind: "bool",
	},

	uiText("UI_BACKLINK_HEADER", "Backlinks heading"),
	uiText("UI_NO_BACKLINKS_MESSAGE", "No backlinks message"),
	uiText("UI_SEARCH_BUTTON_TEXT", "Search button"),
	uiText("UI_SEARCH_PLACEHOLDER", "Search placeholder"),
	uiText("UI_SEARCH_NOT_STARTED_TEXT", "Search start text"),
	uiText("UI_SEARCH_NO_RESULTS", "No results message"),
	uiText("UI_SEARCH_PREVIEW_PLACEHOLDER", "Preview placeholder"),
	uiText("UI_SEARCH_ENTER_HINT", "Select hint"),
	uiText("UI_SEARCH_ENTER_HOTKEY", "Select key label"),
	uiText("UI_SEARCH_NAVIGATE_HINT", "Navigate hint"),
	uiText("UI_SEARCH_NAVIGATE_HOTKEY", "Navigate key label"),
	uiText("UI_SEARCH_CLOSE_HINT", "Close hint"),
	uiText("UI_SEARCH_CLOSE_HOTKEY", "Close key label"),
	uiText("UI_CANVAS_DRAG_HINT", "Canvas drag hint"),
	uiText("UI_CANVAS_ZOOM_HINT", "Canvas zoom hint"),
	uiText("UI_CANVAS_RESET_HINT", "Canvas reset hint"),

	{
		id: "SITE_BASE_URL",
		keys: ["SITE_BASE_URL"],
		section: "address",
		label: "Base URL",
		kind: "text",
		selfHostedOnly: true,
	},

	// Edited from the garden plugins manager; listed so a difference with
	// the site is still visible and publishable.
	noteToggle("dgEnableSearch", "Search", "plugins"),
	noteToggle("dgLinkPreview", "Link previews", "plugins"),
];

export const UI_TEXT_SETTINGS: Record<string, UiStringKey> = {
	UI_BACKLINK_HEADER: "backlinkHeader",
	UI_NO_BACKLINKS_MESSAGE: "noBacklinksMessage",
	UI_SEARCH_BUTTON_TEXT: "searchButtonText",
	UI_SEARCH_PLACEHOLDER: "searchPlaceholder",
	UI_SEARCH_NOT_STARTED_TEXT: "searchNotStarted",
	UI_SEARCH_NO_RESULTS: "searchNoResults",
	UI_SEARCH_PREVIEW_PLACEHOLDER: "searchPreviewPlaceholder",
	UI_SEARCH_ENTER_HINT: "searchEnterHint",
	UI_SEARCH_ENTER_HOTKEY: "searchEnterHotkey",
	UI_SEARCH_NAVIGATE_HINT: "searchNavigateHint",
	UI_SEARCH_NAVIGATE_HOTKEY: "searchNavigateHotkey",
	UI_SEARCH_CLOSE_HINT: "searchCloseHint",
	UI_SEARCH_CLOSE_HOTKEY: "searchCloseHotkey",
	UI_CANVAS_DRAG_HINT: "canvasDragHint",
	UI_CANVAS_ZOOM_HINT: "canvasZoomHint",
	UI_CANVAS_RESET_HINT: "canvasResetHint",
};

export const DEFAULT_THEME_VALUE = '{"name": "default", "modes": ["dark"]}';

export interface ThemeInfo {
	name: string;
	repo: string;
	modes: string[];
	cssUrl: string;
}

/** Theme name for a stylesheet URL, from the theme list or the repo name. */
export function themeFromCssUrl(cssUrl: string, themes: ThemeInfo[]) {
	const known = themes.find((t) => t.cssUrl === cssUrl);

	if (known) return known;

	const repo = cssUrl.match(/githubusercontent\.com\/([^/]+\/[^/]+)\//)?.[1];

	return {
		name: repo?.split("/")[1] ?? cssUrl,
		repo: repo ?? "",
		// Unknown theme: don't block either mode.
		modes: ["dark", "light"],
		cssUrl,
	};
}

/**
 * Writes one site (.env) value back into local settings — used when
 * pulling from the site and by "Revert". The inverse of generateEnvValues.
 */
export function applySiteValue(
	settings: DigitalGardenSettings,
	key: string,
	value: string,
	themes: ThemeInfo[] = [],
) {
	const bool = value === "true";

	const noteSettings = settings.defaultNoteSettings as Record<
		string,
		boolean
	>;

	if (key in noteSettings) {
		noteSettings[key] = bool;

		return;
	}

	if (key in UI_TEXT_SETTINGS) {
		settings.uiStrings[UI_TEXT_SETTINGS[key]] = value;

		return;
	}

	switch (key) {
		case "THEME":
			settings.theme = value
				? JSON.stringify(themeFromCssUrl(value, themes))
				: DEFAULT_THEME_VALUE;
			break;
		case "BASE_THEME":
			// The site omits it with the default theme; keep the local choice.
			if (value) settings.baseTheme = value;
			break;
		case "SITE_NAME_HEADER":
			settings.siteName = value;
			break;
		case "LOGO_HEIGHT":
			settings.logoHeight = value;
			break;
		case "SITE_MAIN_LANGUAGE":
			settings.mainLanguage = value;
			break;
		case "USE_FULL_RESOLUTION_IMAGES":
			settings.useFullResolutionImages = bool;
			break;
		case "STYLE_SETTINGS_CSS":
			settings.styleSettingsCss = value;
			break;
		case "STYLE_SETTINGS_BODY_CLASSES":
			settings.styleSettingsBodyClasses = value;
			break;
		case "SHOW_CREATED_TIMESTAMP":
			settings.showCreatedTimestamp = bool;
			break;
		case "SHOW_UPDATED_TIMESTAMP":
			settings.showUpdatedTimestamp = bool;
			break;
		case "TIMESTAMP_FORMAT":
			settings.timestampFormat = value;
			break;
		case "NOTE_ICON_DEFAULT":
			settings.defaultNoteIcon = value;
			break;
		case "NOTE_ICON_TITLE":
			settings.showNoteIconOnTitle = bool;
			break;
		case "NOTE_ICON_FILETREE":
			settings.showNoteIconInFileTree = bool;
			break;
		case "NOTE_ICON_INTERNAL_LINKS":
			settings.showNoteIconOnInternalLink = bool;
			break;
		case "NOTE_ICON_BACK_LINKS":
			settings.showNoteIconOnBackLink = bool;
			break;
		case "SITE_BASE_URL":
			settings.gardenBaseUrl = value;
			break;
	}
}
