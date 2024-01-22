import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { IPublishPlatformConnection } from "src/models/IPublishPlatformConnection";
import { PublishPlatform } from "src/models/PublishPlatform";
import DigitalGardenSettings from "src/models/settings";
const oktokitLogger = Logger.get("octokit");

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

			const octoKit = new Octokit({
				baseUrl: "https://localhost:7035/app/Garden", //TODO: Move base/app to .env
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
