import DigitalGardenSettings from "../models/settings";

/**
 * Generates the key-value pairs for the garden .env file from plugin settings.
 * Used by both GitHub publishing (DigitalGardenSiteManager.updateEnv) and
 * local export (LocalExporter.writeEnvFile) to keep them in sync.
 */
export function generateEnvValues(
	settings: DigitalGardenSettings,
): Record<string, string | boolean> {
	const theme = JSON.parse(settings.theme);

	let gardenBaseUrl = "";

	// check that gardenbaseurl is not an access token wrongly pasted.
	if (
		settings.gardenBaseUrl &&
		!settings.gardenBaseUrl.startsWith("ghp_") &&
		!settings.gardenBaseUrl.startsWith("github_pat") &&
		settings.gardenBaseUrl.includes(".")
	) {
		gardenBaseUrl = settings.gardenBaseUrl;
	}

	const envValues: Record<string, string | boolean> = {
		SITE_NAME_HEADER: settings.siteName,
		SITE_MAIN_LANGUAGE: settings.mainLanguage,
		SITE_BASE_URL: gardenBaseUrl,
		SHOW_CREATED_TIMESTAMP: settings.showCreatedTimestamp,
		TIMESTAMP_FORMAT: settings.timestampFormat,
		SHOW_UPDATED_TIMESTAMP: settings.showUpdatedTimestamp,
		NOTE_ICON_DEFAULT: settings.defaultNoteIcon,
		NOTE_ICON_TITLE: settings.showNoteIconOnTitle,
		NOTE_ICON_FILETREE: settings.showNoteIconInFileTree,
		NOTE_ICON_INTERNAL_LINKS: settings.showNoteIconOnInternalLink,
		NOTE_ICON_BACK_LINKS: settings.showNoteIconOnBackLink,
		STYLE_SETTINGS_CSS: settings.styleSettingsCss,
		STYLE_SETTINGS_BODY_CLASSES: settings.styleSettingsBodyClasses,
		USE_FULL_RESOLUTION_IMAGES: settings.useFullResolutionImages,
		// UI Strings - only include if not empty (empty = use template default)
		...(settings.uiStrings?.backlinkHeader && {
			UI_BACKLINK_HEADER: settings.uiStrings.backlinkHeader,
		}),
		...(settings.uiStrings?.noBacklinksMessage && {
			UI_NO_BACKLINKS_MESSAGE: settings.uiStrings.noBacklinksMessage,
		}),
		...(settings.uiStrings?.searchButtonText && {
			UI_SEARCH_BUTTON_TEXT: settings.uiStrings.searchButtonText,
		}),
		...(settings.uiStrings?.searchPlaceholder && {
			UI_SEARCH_PLACEHOLDER: settings.uiStrings.searchPlaceholder,
		}),
		...(settings.uiStrings?.searchNotStarted && {
			UI_SEARCH_NOT_STARTED_TEXT: settings.uiStrings.searchNotStarted,
		}),
		...(settings.uiStrings?.searchEnterHotkey && {
			UI_SEARCH_ENTER_HOTKEY: settings.uiStrings.searchEnterHotkey,
		}),
		...(settings.uiStrings?.searchEnterHint && {
			UI_SEARCH_ENTER_HINT: settings.uiStrings.searchEnterHint,
		}),
		...(settings.uiStrings?.searchNavigateHotkey && {
			UI_SEARCH_NAVIGATE_HOTKEY: settings.uiStrings.searchNavigateHotkey,
		}),
		...(settings.uiStrings?.searchNavigateHint && {
			UI_SEARCH_NAVIGATE_HINT: settings.uiStrings.searchNavigateHint,
		}),
		...(settings.uiStrings?.searchCloseHotkey && {
			UI_SEARCH_CLOSE_HOTKEY: settings.uiStrings.searchCloseHotkey,
		}),
		...(settings.uiStrings?.searchCloseHint && {
			UI_SEARCH_CLOSE_HINT: settings.uiStrings.searchCloseHint,
		}),
		...(settings.uiStrings?.searchNoResults && {
			UI_SEARCH_NO_RESULTS: settings.uiStrings.searchNoResults,
		}),
		...(settings.uiStrings?.searchPreviewPlaceholder && {
			UI_SEARCH_PREVIEW_PLACEHOLDER:
				settings.uiStrings.searchPreviewPlaceholder,
		}),
		...(settings.uiStrings?.canvasDragHint && {
			UI_CANVAS_DRAG_HINT: settings.uiStrings.canvasDragHint,
		}),
		...(settings.uiStrings?.canvasZoomHint && {
			UI_CANVAS_ZOOM_HINT: settings.uiStrings.canvasZoomHint,
		}),
		...(settings.uiStrings?.canvasResetHint && {
			UI_CANVAS_RESET_HINT: settings.uiStrings.canvasResetHint,
		}),
	};

	if (theme.name !== "default") {
		envValues["THEME"] = theme.cssUrl;
		envValues["BASE_THEME"] = settings.baseTheme;
	}

	return {
		...envValues,
		...settings.defaultNoteSettings,
	};
}

/**
 * Serializes env key-value pairs to a .env file string.
 */
export function serializeEnvValues(
	values: Record<string, string | boolean>,
): string {
	return Object.entries(values)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}
