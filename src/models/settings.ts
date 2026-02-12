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

	siteName: string;

	pathRewriteRules: string;

	publishPlatform: PublishPlatform;

	ENABLE_DEVELOPER_TOOLS?: boolean;
	devPluginPath?: string;
	logLevel?: ILogLevel;

	// Extended settings for custom path publishing
	publishBasePath?: string;
	typeDirectoryKey?: string;
	subDirectoryKey?: string;
	imagePublishPath?: string;
}
