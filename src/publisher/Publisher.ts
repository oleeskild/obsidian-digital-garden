import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { getRewriteRules } from "../utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "../publishFile/Validator";
import { PathRewriteRules } from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { Assets, GardenPageCompiler } from "../compiler/GardenPageCompiler";
import { CompiledPublishFile, PublishFile } from "../publishFile/PublishFile";
import Logger from "js-logger";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";
import PublishPlatformConnectionFactory from "src/repositoryConnection/PublishPlatformConnectionFactory";
import { PublishPlatform } from "../models/PublishPlatform";

export interface MarkedForPublishing {
	notes: PublishFile[];
	images: string[];
}

export const IMAGE_PATH_BASE = "src/site/img/user/";
export const NOTE_PATH_BASE = "src/site/notes/";

/**
 * Prepares files to be published and publishes them to Github
 */
export default class Publisher {
	vault: Vault;
	metadataCache: MetadataCache;
	compiler: GardenPageCompiler;
	settings: DigitalGardenSettings;
	rewriteRules: PathRewriteRules;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: DigitalGardenSettings,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);

		this.compiler = new GardenPageCompiler(
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

	/**
	 * Check if a canvas file should be published by reading its JSON metadata.
	 * Canvas files store frontmatter in the metadata.frontmatter field.
	 */
	async shouldPublishCanvas(file: TFile): Promise<boolean> {
		if (file.extension !== "canvas") {
			return this.shouldPublish(file);
		}

		try {
			const content = await this.vault.cachedRead(file);
			const canvasData = JSON.parse(content);
			const frontMatter = canvasData?.metadata?.frontmatter;

			return hasPublishFlag(frontMatter);
		} catch {
			return false;
		}
	}

	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		// Get both markdown and canvas files
		const markdownFiles = this.vault.getMarkdownFiles();
		const allFiles = this.vault.getFiles();
		const canvasFiles = allFiles.filter((f) => f.extension === "canvas");
		const files = [...markdownFiles, ...canvasFiles];

		const notesToPublish: PublishFile[] = [];
		const imagesToPublish: Set<string> = new Set();

		for (const file of files) {
			try {
				// Use async check for canvas files (they store frontmatter in JSON)
				const shouldPublish =
					file.extension === "canvas"
						? await this.shouldPublishCanvas(file)
						: this.shouldPublish(file);

				if (shouldPublish) {
					const publishFile = new PublishFile({
						file,
						vault: this.vault,
						compiler: this.compiler,
						metadataCache: this.metadataCache,
						settings: this.settings,
					});

					notesToPublish.push(publishFile);

					// Only extract image links from markdown files
					if (file.extension === "md") {
						const images = await publishFile.getImageLinks();
						images.forEach((i) => imagesToPublish.add(i));
					}
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
		const path = `${NOTE_PATH_BASE}${vaultFilePath}`;

		return await this.delete(path, sha);
	}

	async deleteImage(vaultFilePath: string, sha?: string) {
		const path = `${IMAGE_PATH_BASE}${vaultFilePath}`;

		return await this.delete(path, sha);
	}
	/** If provided with sha, garden connection does not need to get it seperately! */
	public async delete(path: string, sha?: string): Promise<boolean> {
		this.validateSettings();

		const userGardenConnection = new RepositoryConnection(
			await PublishPlatformConnectionFactory.createPublishPlatformConnection(
				this.settings,
			),
		);

		const deleted = await userGardenConnection.deleteFile(path, {
			sha,
		});

		return !!deleted;
	}

	public async publish(file: CompiledPublishFile): Promise<boolean> {
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

	public async deleteBatch(filePaths: string[]): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			await userGardenConnection.deleteFiles(filePaths);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	public async publishBatch(files: CompiledPublishFile[]): Promise<boolean> {
		const filesToPublish = files.filter((f) =>
			isPublishFrontmatterValid(f.frontmatter),
		);

		if (filesToPublish.length === 0) {
			return true;
		}

		try {
			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			await userGardenConnection.updateFiles(filesToPublish);

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

		const userGardenConnection = new RepositoryConnection(
			await PublishPlatformConnectionFactory.createPublishPlatformConnection(
				this.settings,
			),
		);

		if (!remoteFileHash) {
			const file = await userGardenConnection.getFile(path).catch(() => {
				// file does not exist
				Logger.info(`File ${path} does not exist, adding`);
			});
			remoteFileHash = file?.sha;

			if (!remoteFileHash) {
				message = `Add content ${path}`;
			}
		}

		return await userGardenConnection.updateFile({
			content,
			path,
			message,
			sha: remoteFileHash,
		});
	}

	private async uploadText(filePath: string, content: string, sha?: string) {
		content = Base64.encode(content);
		const path = `${NOTE_PATH_BASE}${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	private async uploadImage(filePath: string, content: string, sha?: string) {
		const path = `src/site${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	private async uploadAssets(assets: Assets) {
		for (let idx = 0; idx < assets.images.length; idx++) {
			const image = assets.images[idx];

			await this.uploadImage(image.path, image.content, image.remoteHash);
		}
	}

	validateSettings() {
		if (this.settings.publishPlatform === PublishPlatform.ForestryMd) {
			// For forestry.md, validate forestry settings instead of GitHub
			if (!this.settings.forestrySettings.apiKey) {
				new Notice(
					"Config error: You need to define a Forestry.md Garden Key in the plugin settings",
				);
				throw {};
			}
		} else {
			// For SelfHosted, validate GitHub settings
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
}
