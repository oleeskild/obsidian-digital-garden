import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { getRewriteRules } from "../utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "../publishFile/Validator";
import { PathRewriteRule } from "../repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "../models/settings";
import { Assets, SyncerPageCompiler } from "../compiler/SyncerPageCompiler";
import { CompiledPublishFile, PublishFile } from "../publishFile/PublishFile";
import Logger from "js-logger";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";

export interface MarkedForPublishing {
	notes: PublishFile[];
	blobs: string[];
}

/**
 * Prepares files to be published and publishes them to Github
 */
export default class Publisher {
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: SyncerPageCompiler;
	settings: QuartzSyncerSettings;
	rewriteRule: PathRewriteRule;
	vaultPath: string;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.rewriteRule = getRewriteRules(settings.vaultPath);
		this.vaultPath = settings.vaultPath;

		this.compiler = new SyncerPageCompiler(
			vault,
			settings,
			metadataCache,
			() => this.getFilesMarkedForPublishing(),
		);
	}

	shouldPublish(file: TFile): boolean {
		const frontMatter = this.metadataCache.getCache(file.path)?.frontmatter;

		return hasPublishFlag(this.settings.publishFrontmatterKey, frontMatter);
	}

	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const files = this.vault.getMarkdownFiles().filter((file) => {
			if (
				this.settings.vaultPath !== "/" &&
				this.settings.vaultPath !== ""
			)
				return file.path.startsWith(this.settings.vaultPath);

			return true;
		});
		const notesToPublish: PublishFile[] = [];
		const blobsToPublish: Set<string> = new Set();

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

					const blobs = await publishFile.getBlobLinks();

					blobs.forEach((i) => blobsToPublish.add(i));
				}
			} catch (e) {
				Logger.error(e);
			}
		}

		return {
			notes: notesToPublish.sort((a, b) => a.compare(b)),
			blobs: Array.from(blobsToPublish),
		};
	}

	async deleteNote(vaultFilePath: string, sha?: string) {
		if (
			this.settings.vaultPath !== "/" &&
			this.settings.vaultPath !== "" &&
			vaultFilePath.startsWith(this.settings.vaultPath)
		) {
			vaultFilePath = vaultFilePath.replace(this.settings.vaultPath, "");
		}

		return await this.delete(vaultFilePath, sha);
	}

	async deleteBlob(vaultFilePath: string, sha?: string) {
		if (
			this.settings.vaultPath !== "/" &&
			this.settings.vaultPath !== "" &&
			vaultFilePath.startsWith(this.settings.vaultPath)
		) {
			vaultFilePath = vaultFilePath.replace(this.settings.vaultPath, "");
		}

		return await this.delete(vaultFilePath, sha);
	}
	/** If provided with sha, syncer connection does not need to get it separately! */
	public async delete(path: string, sha?: string): Promise<boolean> {
		this.validateSettings();

		const userSyncerConnection = new RepositoryConnection({
			quartzRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
		});

		const deleted = await userSyncerConnection.deleteFile(path, {
			sha,
		});

		return !!deleted;
	}

	public async publish(file: CompiledPublishFile): Promise<boolean> {
		if (
			!isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				file.frontmatter,
			)
		) {
			return false;
		}

		try {
			const [text, assets] = file.compiledFile;
			await this.uploadText(file.getVaultPath(), text, file?.remoteHash);
			await this.uploadAssets(assets);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	public async deleteBatch(filePaths: string[]): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = new RepositoryConnection({
				quartzRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
				contentFolder: this.settings.contentFolder,
				vaultPath: this.settings.vaultPath,
			});

			await userQuartzConnection.deleteFiles(filePaths);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	public async publishBatch(files: CompiledPublishFile[]): Promise<boolean> {
		const filesToPublish = files.filter((f) =>
			isPublishFrontmatterValid(
				this.settings.publishFrontmatterKey,
				f.frontmatter,
			),
		);

		if (filesToPublish.length === 0) {
			return true;
		}

		try {
			const userQuartzConnection = new RepositoryConnection({
				quartzRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
				contentFolder: this.settings.contentFolder,
				vaultPath: this.settings.vaultPath,
			});

			await userQuartzConnection.updateFiles(filesToPublish);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	private async uploadToGithub(
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
			contentFolder: this.settings.contentFolder,
			vaultPath: this.settings.vaultPath,
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

	private async uploadText(filePath: string, content: string, sha?: string) {
		content = Base64.encode(content);
		const path = `${this.settings.contentFolder}/${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	private async uploadBlob(filePath: string, content: string, sha?: string) {
		let previous;

		do {
			previous = filePath;
			filePath = filePath.replace(/\.\.\//g, "");
		} while (filePath !== previous);
		const actualFilePath = filePath;
		const path = `${this.settings.contentFolder}/${actualFilePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	private async uploadAssets(assets: Assets) {
		for (let idx = 0; idx < assets.blobs.length; idx++) {
			const blob = assets.blobs[idx];
			await this.uploadBlob(blob.path, blob.content, blob.remoteHash);
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

		if (!this.settings.contentFolder) {
			new Notice(
				"Config error: You need to define a Content Folder in the plugin settings",
			);
			throw {};
		}

		if (!this.settings.vaultPath) {
			new Notice(
				"Config error: You need to define a Vault Folder in the plugin settings",
			);
			throw {};
		}
	}
}
