import { ILogLevel } from "js-logger";

/** Saved to data.json, changing requires a migration */
export default interface QuartzSyncerSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	prHistory: string[];

	useFullResolutionImages: boolean;

	siteName: string;

	noteSettingsIsInitialized: boolean;

	slugifyEnabled: boolean;

	contentFolder: string;

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

	usePermalink: boolean;

	defaultNoteSettings: {
		HomeLink: boolean;
		PassFrontmatter: boolean;
	};
	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;
}
