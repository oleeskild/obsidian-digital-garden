import type DigitalGardenSettings from "src/models/settings";
import { type MetadataCache, Notice, type TFile } from "obsidian";
import {
	extractBaseUrl,
	generateUrlPath,
	getGardenPathForNote,
	getRewriteRules,
} from "../utils/utils";
import { Base64 } from "js-base64";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "./RepositoryConnection";
import Logger from "js-logger";
import { TemplateUpdateChecker } from "./TemplateManager";
import { NOTE_PATH_BASE, IMAGE_PATH_BASE } from "../publisher/Publisher";
import PublishPlatformConnectionFactory from "./PublishPlatformConnectionFactory";
import { PublishPlatform } from "src/models/PublishPlatform";
import { generateEnvValues, serializeEnvValues } from "../utils/envSettings";

const logger = Logger.get("digital-garden-site-manager");
export interface PathRewriteRule {
	from: string;
	to: string;
}
export type PathRewriteRules = PathRewriteRule[];

type ContentTreeItem = {
	path: string;
	sha: string;
	type: string;
};

/**
 * Manages the digital garden website by handling various site configurations, files,
 * and interactions with GitHub via Octokit. Responsible for operations like updating
 * environment variables, fetching and updating notes & images, and creating pull requests
 * for site changes.
 */

export default class DigitalGardenSiteManager {
	settings: DigitalGardenSettings;
	metadataCache: MetadataCache;
	rewriteRules: PathRewriteRules;
	baseGardenConnection: RepositoryConnection;

	private userGardenConnection: RepositoryConnection | null;
	private templateUpdater: TemplateUpdateChecker | null;
	constructor(metadataCache: MetadataCache, settings: DigitalGardenSettings) {
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);

		this.baseGardenConnection = new RepositoryConnection(
			PublishPlatformConnectionFactory.createBaseGardenConnection(),
		);
		this.userGardenConnection = null;
		this.templateUpdater = null;
	}

	async getTemplateUpdater() {
		if (!this.templateUpdater) {
			this.templateUpdater = new TemplateUpdateChecker({
				baseGardenConnection: this.baseGardenConnection,
				userGardenConnection: await this.getUserGardenConnection(),
			});
		}

		return this.templateUpdater;
	}
	async getUserGardenConnection() {
		if (!this.userGardenConnection) {
			this.userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);
		}

		return this.userGardenConnection;
	}

	async updateEnv() {
		const keysToSet = generateEnvValues(this.settings);

		const currentFile = await (
			await this.getUserGardenConnection()
		).getFile(".env");

		const decodedCurrentFile = Base64.decode(currentFile?.content ?? "");

		// Parse existing remote settings and use as base to avoid
		// overwriting settings that haven't been loaded into memory yet
		const existingSettings: Record<string, string> = {};

		for (const line of decodedCurrentFile.split("\n")) {
			const trimmedLine = line.trim();

			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			const [key, ...valueParts] = trimmedLine.split("=");

			if (key) {
				existingSettings[key.trim()] = valueParts.join("=").trim();
			}
		}

		const mergedSettings = {
			...existingSettings,
			...keysToSet,
		};

		const envSettings = serializeEnvValues(mergedSettings);

		const base64Settings = Base64.encode(envSettings);

		if (decodedCurrentFile === envSettings) {
			logger.info("No changes to .env file");

			new Notice("Settings already up to date!");

			return;
		}

		await (
			await this.getUserGardenConnection()
		).updateFile({
			path: ".env",
			content: base64Settings,
			message: "Update settings",
			sha: currentFile?.sha,
		});
	}

	getNoteUrl(file: TFile): string {
		const savedBaseUrl =
			this.settings.publishPlatform === PublishPlatform.SelfHosted
				? this.settings.gardenBaseUrl
				: this.settings.forestrySettings.baseUrl;

		if (!savedBaseUrl) {
			new Notice("Please set the garden base url in the settings");

			// caught in copyUrlToClipboard
			throw new Error("Garden base url not set");
		}

		const baseUrl = `https://${extractBaseUrl(savedBaseUrl)}`;

		const noteUrlPath = generateUrlPath(
			getGardenPathForNote(file.path, this.rewriteRules),
			this.settings.slugifyEnabled,
		);

		let urlPath = `/${noteUrlPath}`;

		const frontMatter = this.metadataCache.getCache(file.path)?.frontmatter;

		if (frontMatter && frontMatter["dg-home"] === true) {
			urlPath = "/";
		} else if (frontMatter?.permalink) {
			urlPath = `/${frontMatter.permalink}`;
		} else if (frontMatter?.["dg-permalink"]) {
			urlPath = `/${frontMatter["dg-permalink"]}`;
		}

		return `${baseUrl}${urlPath}`;
	}

	async getNoteContent(path: string): Promise<string> {
		if (path.startsWith("/")) {
			path = path.substring(1);
		}

		const response = await (
			await this.getUserGardenConnection()
		).getFile(NOTE_PATH_BASE + path);

		if (!response) {
			return "";
		}

		const content = Base64.decode(response.content);

		return content;
	}

	async getNoteHashes(
		contentTree: NonNullable<TRepositoryContent>,
	): Promise<Record<string, string>> {
		const files = contentTree.tree;

		const notes = files.filter(
			(x): x is ContentTreeItem =>
				typeof x.path === "string" &&
				x.path.startsWith(NOTE_PATH_BASE) &&
				x.type === "blob" &&
				x.path !== `${NOTE_PATH_BASE}notes.json`,
		);
		const hashes: Record<string, string> = {};

		for (const note of notes) {
			const vaultPath = note.path.replace(NOTE_PATH_BASE, "");
			hashes[vaultPath] = note.sha;
		}

		return hashes;
	}

	async getImageHashes(
		contentTree: NonNullable<TRepositoryContent>,
	): Promise<Record<string, string>> {
		const files = contentTree.tree ?? [];

		const images = files.filter(
			(x): x is ContentTreeItem =>
				typeof x.path === "string" &&
				x.path.startsWith(IMAGE_PATH_BASE) &&
				x.type === "blob",
		);
		const hashes: Record<string, string> = {};

		for (const img of images) {
			const vaultPath = img.path.replace(IMAGE_PATH_BASE, "");
			hashes[vaultPath] = img.sha;
		}

		return hashes;
	}
}
