/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { IPublishPlatformConnection } from "src/models/IPublishPlatformConnection";
import { PublishPlatform } from "src/models/PublishPlatform";
import DigitalGardenSettings from "src/models/settings";
import { RepositoryConnection } from "./RepositoryConnection";
import { ForgejoRepositoryConnection } from "./ForgejoRepositoryConnection";

const oktokitLogger = Logger.get("octokit");

// Default base URL to use as fallback
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export default class PublishPlatformConnectionFactory {
	static createBaseGardenConnection(
		token?: string,
	): IPublishPlatformConnection {
		return this.createGitHubConnection("oleeskild", "digitalgarden", token);
	}

	/**
	 * Connection to an arbitrary public GitHub repo. Pass the user's token
	 * when available: authenticated requests get 5,000 req/h instead of the
	 * 60 req/h per-IP unauthenticated limit, which template updates (one
	 * request per changed file) can exhaust.
	 */
	static createGitHubConnection(
		userName: string,
		pageName: string,
		token?: string,
	): IPublishPlatformConnection {
		return {
			octoKit: new Octokit({
				auth: token || undefined,
				log: oktokitLogger,
			}),
			userName,
			pageName,
		};
	}

	/**
	 * The user's GitHub token, when it can be used against github.com.
	 * Only self-hosted setups are known to hold a valid GitHub token —
	 * a Forestry user's stored token may be stale, and sending an invalid
	 * token turns rate limiting into hard 401s.
	 */
	static githubTokenFor(
		settings: Pick<
			DigitalGardenSettings,
			"publishPlatform" | "githubToken"
		>,
	): string | undefined {
		if (settings.publishPlatform !== PublishPlatform.SelfHosted) {
			return undefined;
		}

		return settings.githubToken || undefined;
	}
	static createPublishPlatformConnection(
		settings: DigitalGardenSettings,
	): any {
		if (settings.publishPlatform === PublishPlatform.Forgejo) {
			return new ForgejoRepositoryConnection(settings);
		}

		if (settings.publishPlatform === PublishPlatform.LocalFolder) {
			// These providers use Node builtins and are desktop-only. Keep them
			// out of the plugin-load path so Obsidian mobile can start safely.
			/* eslint-disable @typescript-eslint/no-var-requires -- intentional lazy load */
			const {
				LocalFolderRepositoryConnection,
			} = require("./LocalFolderRepositoryConnection");

			/* eslint-enable @typescript-eslint/no-var-requires */
			return new LocalFolderRepositoryConnection(settings);
		}

		if (settings.publishPlatform === PublishPlatform.Sftp) {
			/* eslint-disable @typescript-eslint/no-var-requires -- intentional lazy load */
			const {
				SftpRepositoryConnection,
			} = require("./SftpRepositoryConnection");

			/* eslint-enable @typescript-eslint/no-var-requires */
			return new SftpRepositoryConnection(settings);
		}

		if (settings.publishPlatform === PublishPlatform.SelfHosted) {
			return new RepositoryConnection({
				octoKit: new Octokit({
					auth: settings.githubToken,
					log: oktokitLogger,
				}),
				userName: settings.githubUserName,
				pageName: settings.githubRepo,
				contentBaseDir: settings.contentBaseDir,
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
		} else {
			throw new Error("Publish platform not supported");
		}
	}
}
