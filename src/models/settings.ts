import { ILogLevel } from "js-logger";
import { PublishPlatform } from "./PublishPlatform";

/** Saved to data.json, changing requires a migration */
export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;

	gardenBaseUrl: string;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;
	logoPath: string;
	/** CSS height for the site logo, e.g. "40" (px) or "3rem". Empty = template default. */
	logoHeight: string;
	mainLanguage: string;
	useFullResolutionImages: boolean;

	siteName: string;

	noteSettingsIsInitialized: boolean;

	slugifyEnabled: boolean;
	excalidrawSvgExportEnabled: boolean;

	noteIconKey: string;
	defaultNoteIcon: string;
	showNoteIconOnTitle: boolean;
	showNoteIconInFileTree: boolean;
	showNoteIconOnInternalLink: boolean;
	showNoteIconOnBackLink: boolean;

	showCreatedTimestamp: boolean;
	createdTimestampKey: string;

	showUpdatedTimestamp: boolean;
	updatedTimestampKey: string;

	timestampFormat: string;

	styleSettingsCss: string;
	styleSettingsBodyClasses: string;

	pathRewriteRules: string;
	customFilters: Array<{ pattern: string; flags: string; replace: string }>;
	contentClassesKey: string;

	publishPlatform: PublishPlatform;
	forestrySettings: {
		forestryPageName: string;
		apiKey: string;
		baseUrl: string;
	};

	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
		dgShowBacklinks: boolean;
		dgShowLocalGraph: boolean;
		dgShowGraphDepthControl: boolean;
		dgShowInlineTitle: boolean;
		dgShowFileTree: boolean;
		dgEnableSearch: boolean;
		dgShowToc: boolean;
		dgLinkPreview: boolean;
		dgShowTags: boolean;
	};

	uiStrings: {
		backlinkHeader: string;
		noBacklinksMessage: string;
		searchButtonText: string;
		searchPlaceholder: string;
		searchNotStarted: string;
		searchEnterHotkey: string;
		searchEnterHint: string;
		searchNavigateHotkey: string;
		searchNavigateHint: string;
		searchCloseHotkey: string;
		searchCloseHint: string;
		searchNoResults: string;
		searchPreviewPlaceholder: string;
		canvasDragHint: string;
		canvasZoomHint: string;
		canvasResetHint: string;
	};

	navigationOrder?: Record<string, string[]>;

	/** When true, the "switch to Forestry.md" nudge in the self-hosted setup is hidden. */
	hideForestryUpgradeNotice?: boolean;

	/** When true, the automatic startup check for site template updates (and its Notice) is skipped. Manually checking/updating in settings still works. */
	disableTemplateUpdateNotice?: boolean;

	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
	localExportPath?: string;
	/** Dev-only opt-in: run the local export automatically on plugin load. */
	localExportOnLoad?: boolean;
	contentBaseDir?: string;
}
