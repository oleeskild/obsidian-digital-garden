import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { getRewriteRules } from "../utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "../publishFile/Validator";
import { PathRewriteRules } from "../repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "../models/settings";
import { Assets, SyncerPageCompiler } from "../compiler/SyncerPageCompiler";
import { CompiledPublishFile, PublishFile } from "../publishFile/PublishFile";
import Logger from "js-logger";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";

export interface MarkedForPublishing {
	notes: PublishFile[];
	images: string[];
}

/**
 * Prepares files to be published and publishes them to Github
 */
export default class Publisher {
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: SyncerPageCompiler;
	settings: QuartzSyncerSettings;
	rewriteRules: PathRewriteRules;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);

		this.compiler = new SyncerPageCompiler(
			vault,
			settings,
			metadataCache,
			() => this.getFilesMarkedForPublishing(),
		);
	}

	shouldPublish(file: TFile): boolean {
		const frontMatter = this.metadataCache.getCache(file.path)?.frontmatter;

		return hasPublishFlag(frontMatter);
	}

	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const files = this.vault.getMarkdownFiles();
		const notesToPublish: PublishFile[] = [];
		const imagesToPublish: Set<string> = new Set();

		for (const file of files) {
			try {
				if (this.shouldPublish(file)) {
					const publishFile = new PublishFile({
						file,
						vault: this.vault,
						compiler: this.compiler,
						metadataCache: this.metadataCache,
						settings: this.settings,
					});

					notesToPublish.push(publishFile);

					const images = await publishFile.getImageLinks();

					images.forEach((i) => imagesToPublish.add(i));
				}
			} catch (e) {
				Logger.error(e);
			}
		}

		return {
			notes: notesToPublish.sort((a, b) => a.compare(b)),
			images: Array.from(imagesToPublish),
		};
	}

	async deleteNote(vaultFilePath: string, sha?: string) {
		const path = `${this.settings.contentFolder}/${vaultFilePath}`;

		return await this.delete(path, sha);
	}

	async deleteImage(vaultFilePath: string, sha?: string) {
		const path = `${this.settings.contentFolder}/${vaultFilePath}`;

		return await this.delete(path, sha);
	}
	/** If provided with sha, garden connection does not need to get it seperately! */
	async delete(path: string, sha?: string): Promise<boolean> {
		this.validateSettings();

		const userSyncerConnection = new RepositoryConnection({
			quartzRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
		});

		const deleted = await userSyncerConnection.deleteFile(path, {
			sha,
		});

		return !!deleted;
	}

	async publish(file: CompiledPublishFile): Promise<boolean> {
		if (!isPublishFrontmatterValid(file.frontmatter)) {
			return false;
		}

		try {
			const [text, assets] = file.compiledFile;
			await this.uploadText(file.getPath(), text, file?.remoteHash);
			await this.uploadAssets(assets);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	async uploadToGithub(
		path: string,
		content: string,
		remoteFileHash?: string,
	) {
		this.validateSettings();
		let message = `Update content ${path}`;

		const userSyncerConnection = new RepositoryConnection({
			quartzRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
		});

		if (!remoteFileHash) {
			const file = await userSyncerConnection.getFile(path).catch(() => {
				// file does not exist
				Logger.info(`File ${path} does not exist, adding`);
			});
			remoteFileHash = file?.sha;

			if (!remoteFileHash) {
				message = `Add content ${path}`;
			}
		}

		return await userSyncerConnection.updateFile({
			content,
			path,
			message,
			sha: remoteFileHash,
		});
	}

	async uploadText(filePath: string, content: string, sha?: string) {
		content = Base64.encode(content);
		const path = `${this.settings.contentFolder}/${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	async uploadImage(filePath: string, content: string, sha?: string) {
		const path = `${this.settings.contentFolder}/${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	async uploadAssets(assets: Assets) {
		for (let idx = 0; idx < assets.images.length; idx++) {
			const image = assets.images[idx];
			await this.uploadImage(image.path, image.content, image.remoteHash);
		}
	}

	validateSettings() {
		if (!this.settings.githubRepo) {
			new Notice(
				"Config error: You need to define a GitHub repo in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.githubUserName) {
			new Notice(
				"Config error: You need to define a GitHub Username in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.githubToken) {
			new Notice(
				"Config error: You need to define a GitHub Token in the plugin settings",
			);
			throw {};
		}
	}
}
