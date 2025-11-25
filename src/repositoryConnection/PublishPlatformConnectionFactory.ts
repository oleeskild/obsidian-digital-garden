import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { IPublishPlatformConnection } from "src/models/IPublishPlatformConnection";
import { PublishPlatform } from "src/models/PublishPlatform";
import DigitalGardenSettings from "src/models/settings";

const oktokitLogger = Logger.get("octokit");

// Default base URL to use as fallback
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export default class PublishPlatformConnectionFactory {
	static createBaseGardenConnection(): IPublishPlatformConnection {
		return {
			octoKit: new Octokit({ log: oktokitLogger }),
			userName: "oleeskild",
			pageName: "digitalgarden",
		};
	}
	static async createPublishPlatformConnection(
		settings: DigitalGardenSettings,
	): Promise<IPublishPlatformConnection> {
		if (settings.publishPlatform === PublishPlatform.SelfHosted) {
			return {
				octoKit: new Octokit({
					auth: settings.githubToken,
					log: oktokitLogger,
				}),
				userName: settings.githubUserName,
				pageName: settings.githubRepo,
			};
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

			return {
				userName,
				pageName,
				octoKit,
			};
		} else {
			throw new Error("Publish platform not supported");
		}
	}
}
