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
		const theme = JSON.parse(this.settings.theme);
		const baseTheme = this.settings.baseTheme;
		const siteName = this.settings.siteName;
		const mainLanguage = this.settings.mainLanguage;
		let gardenBaseUrl = "";

		// check that gardenbaseurl is not an access token wrongly pasted.
		if (
			this.settings.gardenBaseUrl &&
			!this.settings.gardenBaseUrl.startsWith("ghp_") &&
			!this.settings.gardenBaseUrl.startsWith("github_pat") &&
			this.settings.gardenBaseUrl.contains(".")
		) {
			gardenBaseUrl = this.settings.gardenBaseUrl;
		}

		const envValues = {
			SITE_NAME_HEADER: siteName,
			SITE_MAIN_LANGUAGE: mainLanguage,
			SITE_BASE_URL: gardenBaseUrl,
			SHOW_CREATED_TIMESTAMP: this.settings.showCreatedTimestamp,
			TIMESTAMP_FORMAT: this.settings.timestampFormat,
			SHOW_UPDATED_TIMESTAMP: this.settings.showUpdatedTimestamp,
			NOTE_ICON_DEFAULT: this.settings.defaultNoteIcon,
			NOTE_ICON_TITLE: this.settings.showNoteIconOnTitle,
			NOTE_ICON_FILETREE: this.settings.showNoteIconInFileTree,
			NOTE_ICON_INTERNAL_LINKS: this.settings.showNoteIconOnInternalLink,
			NOTE_ICON_BACK_LINKS: this.settings.showNoteIconOnBackLink,
			STYLE_SETTINGS_CSS: this.settings.styleSettingsCss,
			STYLE_SETTINGS_BODY_CLASSES: this.settings.styleSettingsBodyClasses,
			USE_FULL_RESOLUTION_IMAGES: this.settings.useFullResolutionImages,
		} as Record<string, string | boolean>;

		if (theme.name !== "default") {
			envValues["THEME"] = theme.cssUrl;
			envValues["BASE_THEME"] = baseTheme;
		}

		const keysToSet = {
			...envValues,
			...this.settings.defaultNoteSettings,
		};

		const envSettings = Object.entries(keysToSet)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		const base64Settings = Base64.encode(envSettings);

		const currentFile = await (
			await this.getUserGardenConnection()
		).getFile(".env");

		const decodedCurrentFile = Base64.decode(currentFile?.content ?? "");

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
