import { ILogLevel } from "js-logger";
import { PublishPlatform } from "./PublishPlatform";

/** Saved to data.json, changing requires a migration */
export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;

	/**
	 * The base path where notes will be published in the repository.
	 * Default is "src/site/notes/" for backward compatibility.
	 * User can configure this to publish to custom paths like "src/content/".
	 */
	contentBasePath: string;

	gardenBaseUrl: string;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;
	logoPath: string;
	mainLanguage: string;
	useFullResolutionImages: boolean;

	siteName: string;

	noteSettingsIsInitialized: boolean;

	slugifyEnabled: boolean;

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

	/**
	 * Auto-deployment settings
	 * Configure automatic deployment triggers after publishing content
	 */
	autoDeploySettings: {
		/** Whether to enable automatic deployment after publishing */
		enabled: boolean;
		/** The GitHub Actions workflow ID or filename to trigger (e.g., "deploy.yml") */
		workflowId: string;
		/** The branch to deploy (default: main) */
		branch: string;
		/** Custom inputs to pass to the workflow */
		workflowInputs: Record<string, string>;
	};

	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
		dgShowBacklinks: boolean;
		dgShowLocalGraph: boolean;
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
		searchEnterHint: string;
		searchNavigateHint: string;
		searchCloseHint: string;
		searchNoResults: string;
		searchPreviewPlaceholder: string;
		canvasDragHint: string;
		canvasZoomHint: string;
		canvasResetHint: string;
	};

	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
