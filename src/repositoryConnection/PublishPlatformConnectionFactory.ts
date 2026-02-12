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
		} else {
			throw new Error("Publish platform not supported");
		}
	}
}
