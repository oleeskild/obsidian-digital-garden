import { ILogLevel } from "js-logger";
import { PublishPlatform } from "./PublishPlatform";
import { GitProvider, PublicationProvider } from "./PublicationProvider";

export const DEFAULT_SFTP_PRIVATE_KEY_PATH = "~/.ssh/id_ed25519";

/** Saved to data.json, changing requires a migration */
export default interface DigitalGardenSettings {
	gitToken: string;
	gitRepo: string;
	gitUsername: string;
	/** REST API root, e.g. https://git.example.com/api/v1. */
	forgejoApiUrl?: string;

	// SFTP
	sftpHost: string;
	sftpPort: number;
	sftpUsername: string;
	sftpPassword: string;
	sftpPrivateKeyPath: string;
	sftpPrivateKeyPassphrase: string;
	sftpRemoteRoot: string;
	/** OpenSSH SHA256 fingerprint, for example SHA256:abc... */
	sftpHostKeyFingerprint: string;

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
	publicationProvider: PublicationProvider;
	gitProvider: GitProvider;
	publishByDefault: boolean;
	linkFormat: "markdown" | "wikilink";
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

	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
	localExportPath?: string;
	/** Dev-only opt-in: run the local export automatically on plugin load. */
	localExportOnLoad?: boolean;
	/** Repository-relative destinations. Empty values retain the template defaults. */
	notesDirectory?: string;
	assetsDirectory?: string;
	siteDirectory?: string;
	settingsFilePath?: string;
}
