import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { PublishPlatform } from "src/models/PublishPlatform";
import DigitalGardenSettings from "src/models/settings";
import {
	IRepositoryConnection,
	RepositoryConnection,
} from "./RepositoryConnection";
import {
	createForgejoApi,
	ForgejoRepositoryConnection,
} from "./ForgejoRepositoryConnection";
import { LocalFolderRepositoryConnection } from "./LocalFolderRepositoryConnection";
import { SftpRepositoryConnection } from "./SftpRepositoryConnection";

const oktokitLogger = Logger.get("octokit");

// Default base URL to use as fallback
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export default class PublishPlatformConnectionFactory {
	static createBaseGardenConnection(): IRepositoryConnection {
		return new RepositoryConnection({
			octoKit: new Octokit({ log: oktokitLogger }),
			userName: "oleeskild",
			pageName: "digitalgarden",
		});
	}
	static async createPublishPlatformConnection(
		settings: DigitalGardenSettings,
	): Promise<IRepositoryConnection> {
		if (settings.publishPlatform === PublishPlatform.GitHub) {
			return new RepositoryConnection({
				octoKit: new Octokit({
					auth: settings.gitToken,
					log: oktokitLogger,
				}),
				userName: settings.gitUsername,
				pageName: settings.gitRepo,
				notesDirectory: settings.notesDirectory,
				assetsDirectory: settings.assetsDirectory,
			});
		} else if (settings.publishPlatform === PublishPlatform.Forgejo) {
			const baseUrl = settings.forgejoApiUrl?.trim().replace(/\/+$/, "");

			if (!baseUrl) {
				throw new Error("Forgejo API URL is not configured");
			}

			return new ForgejoRepositoryConnection({
				api: createForgejoApi(baseUrl, settings.gitToken),
				userName: settings.gitUsername,
				pageName: settings.gitRepo,
				notesDirectory: settings.notesDirectory,
				assetsDirectory: settings.assetsDirectory,
			});
		} else if (settings.publishPlatform === PublishPlatform.ForestryMd) {
			const userName = "Forestry";
			const token = settings.forestrySettings.apiKey;

			// Read from environment variable with fallback to default
			const baseUrl =
				process.env.FORESTRY_BASE_URL || DEFAULT_FORESTRY_BASE_URL;

			const octoKit = new Octokit({
				baseUrl: `${baseUrl}/Garden`,
				auth: token,
				log: oktokitLogger,
			});

			const pageName = settings.forestrySettings.forestryPageName;

			return new RepositoryConnection({
				userName,
				pageName,
				octoKit,
			});
		} else if (settings.publishPlatform === PublishPlatform.LocalFolder) {
			return new LocalFolderRepositoryConnection(settings);
		} else if (settings.publishPlatform === PublishPlatform.Sftp) {
			return new SftpRepositoryConnection(settings);
		} else {
			throw new Error("Publish platform not supported");
		}
	}
}
