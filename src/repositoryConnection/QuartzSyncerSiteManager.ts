import type QuartzSyncerSettings from "src/models/settings";
import { type MetadataCache, Notice } from "obsidian";
import { Base64 } from "js-base64";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "./RepositoryConnection";
import Logger from "js-logger";
import { TemplateUpdateChecker } from "./TemplateManager";

const logger = Logger.get("quartz-syncer-site-manager");
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

export default class QuartzSyncerSiteManager {
	settings: QuartzSyncerSettings;
	metadataCache: MetadataCache;
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;

	templateUpdater: TemplateUpdateChecker;
	constructor(metadataCache: MetadataCache, settings: QuartzSyncerSettings) {
		this.settings = settings;
		this.metadataCache = metadataCache;

		this.baseSyncerConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: "saberzero1",
			quartzRepository: "quartz",
			contentFolder: "content",
		});

		this.userSyncerConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: settings.githubUserName,
			quartzRepository: settings.githubRepo,
			contentFolder: settings.contentFolder,
		});

		this.templateUpdater = new TemplateUpdateChecker({
			baseSyncerConnection: this.baseSyncerConnection,
			userSyncerConnection: this.userSyncerConnection,
		});
	}

	async updateEnv() {
		const envValues = {
			SHOW_CREATED_TIMESTAMP: this.settings.showCreatedTimestamp,
			TIMESTAMP_FORMAT: this.settings.timestampFormat,
			SHOW_UPDATED_TIMESTAMP: this.settings.showUpdatedTimestamp,
			STYLE_SETTINGS_CSS: this.settings.styleSettingsCss,
			STYLE_SETTINGS_BODY_CLASSES: this.settings.styleSettingsBodyClasses,
			USE_FULL_RESOLUTION_IMAGES: this.settings.useFullResolutionImages,
		} as Record<string, string | boolean>;

		const keysToSet = {
			...envValues,
			...this.settings.defaultNoteSettings,
		};

		const envSettings = Object.entries(keysToSet)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		const base64Settings = Base64.encode(envSettings);

		const currentFile = await this.userSyncerConnection.getFile(".env");

		const decodedCurrentFile = Base64.decode(currentFile?.content ?? "");

		if (decodedCurrentFile === envSettings) {
			logger.info("No changes to .env file");

			new Notice("Settings already up to date!");

			return;
		}

		await this.userSyncerConnection.updateFile({
			path: ".env",
			content: base64Settings,
			message: "Update settings",
			sha: currentFile?.sha,
		});
	}

	async getNoteContent(path: string): Promise<string> {
		if (path.startsWith("/")) {
			path = path.substring(1);
		}

		const response = await this.userSyncerConnection.getFile(
			`${this.settings.contentFolder}/${path}`,
		);

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
				x.path.startsWith(this.settings.contentFolder) &&
				x.type === "blob" &&
				x.path !== `${this.settings.contentFolder}/notes.json`,
		);
		const hashes: Record<string, string> = {};

		for (const note of notes) {
			const vaultPath = note.path.replace(
				this.settings.contentFolder,
				"",
			);

			const actualVaultPath = vaultPath.startsWith("/")
				? vaultPath.substring(1)
				: vaultPath;
			hashes[actualVaultPath] = note.sha;
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
				x.path.startsWith(this.settings.contentFolder) &&
				x.type === "blob",
		);
		const hashes: Record<string, string> = {};

		for (const img of images) {
			const vaultPath = decodeURI(
				img.path.replace(this.settings.contentFolder, ""),
			);

			const actualVaultPath = vaultPath.startsWith("/")
				? vaultPath.substring(1)
				: vaultPath;
			hashes[actualVaultPath] = img.sha;
		}

		return hashes;
	}
}
