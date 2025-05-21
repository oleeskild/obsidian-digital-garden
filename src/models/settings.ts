import { ILogLevel } from "js-logger";

/** Saved to data.json, changing requires a migration */
export default interface QuartzSyncerSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;

	useFullResolutionImages: boolean;

	noteSettingsIsInitialized: boolean;

	contentFolder: string;
	vaultPath: string;

	showCreatedTimestamp: boolean;
	createdTimestampKey: string;

	showUpdatedTimestamp: boolean;
	updatedTimestampKey: string;

	showPublishedTimestamp: boolean;
	publishedTimestampKey: string;

	timestampFormat: string;

	pathRewriteRules: string;

	usePermalink: boolean;

	applyEmbeds: boolean;

	publishFrontmatterKey: string;

	useDataview: boolean;
	useExcalidraw: boolean;

	useThemes: boolean;

	includeAllFrontmatter: boolean;

	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
