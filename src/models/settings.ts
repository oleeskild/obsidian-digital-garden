import { ILogLevel } from "js-logger";
import { PublishPlatform } from "./PublishPlatform";
import { BlobStorageProviderType } from "../storage/IBlobStorageProvider";

/** Blob storage provider settings */
export interface BlobStorageSettings {
	/** The type of blob storage provider to use */
	providerType: BlobStorageProviderType;
	/** Whether blob storage is enabled */
	enabled: boolean;

	// S3-compatible settings (R2, B2, S3)
	s3Endpoint?: string;
	s3AccessKeyId?: string;
	s3SecretAccessKey?: string;
	s3Bucket?: string;
	s3Region?: string;
	s3PublicUrlBase?: string;
	s3PathPrefix?: string;

	// Azure Blob settings
	azureAccountName?: string;
	azureAccountKey?: string;
	azureContainer?: string;
	azurePublicUrlBase?: string;
	azurePathPrefix?: string;
}

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

	/** External blob storage settings for images */
	blobStorage?: BlobStorageSettings;
}
