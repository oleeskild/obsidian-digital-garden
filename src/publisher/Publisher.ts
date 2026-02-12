import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { getRewriteRules, getGardenPathForNote } from "../utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "../publishFile/Validator";
import DigitalGardenSiteManager, {
	PathRewriteRules,
	getNotePathBase,
} from "../repositoryConnection/DigitalGardenSiteManager";
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
const DEFAULT_NOTE_PATH_BASE = "src/site/notes/";

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

	/**
	 * Extract asset paths (images and PDFs) from a canvas file.
	 * Canvas files can reference assets via file nodes and group backgrounds.
	 */
	async extractCanvasAssets(file: TFile): Promise<string[]> {
		const images: string[] = [];

		const imageExtensions = [
			"png",
			"jpg",
			"jpeg",
			"gif",
			"webp",
			"svg",
			"bmp",
			"pdf",
		];

		try {
			const content = await this.vault.cachedRead(file);
			const canvasData = JSON.parse(content);

			if (!canvasData.nodes || !Array.isArray(canvasData.nodes)) {
				return images;
			}

			for (const node of canvasData.nodes) {
				// File nodes can reference images
				if (node.type === "file" && node.file) {
					const ext = node.file.split(".").pop()?.toLowerCase();

					if (ext && imageExtensions.includes(ext)) {
						images.push(node.file);
					}
				}

				// Group nodes can have background images
				if (node.type === "group" && node.background) {
					const ext = node.background.split(".").pop()?.toLowerCase();

					if (ext && imageExtensions.includes(ext)) {
						images.push(node.background);
					}
				}
			}
		} catch (e) {
			Logger.error(
				`Failed to extract images from canvas ${file.path}`,
				e,
			);
		}

		return images;
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

					// Extract image links from markdown files
					if (file.extension === "md") {
						const images = await publishFile.getImageLinks();
						images.forEach((i) => imagesToPublish.add(i));
					}

					// Extract asset links (images and PDFs) from canvas files
					if (file.extension === "canvas") {
						const assets = await this.extractCanvasAssets(file);
						assets.forEach((i) => imagesToPublish.add(i));
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
		const notePathBase = getNotePathBase(this.settings);
		const path = `${notePathBase}${vaultFilePath}`;

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
			const _remoteImageHashes = await this.getRemoteImageHashes();

			await this.uploadText(file.getPath(), text, file?.remoteHash);
			await this.uploadAssets(assets, _remoteImageHashes);

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

	public async deleteImageBatch(filePaths: string[]): Promise<boolean> {
		if (filePaths.length === 0) {
			return true;
		}

		try {
			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			// Convert image paths to full paths with IMAGE_PATH_BASE prefix
			const fullPaths = filePaths.map(
				(path) => `${IMAGE_PATH_BASE}${path}`,
			);
			await userGardenConnection.deleteFiles(fullPaths);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	/**
	 * Trigger auto-deployment workflow if enabled
	 * @returns true if deployment was triggered successfully
	 */
	public async triggerDeployment(): Promise<boolean> {
		if (!this.settings.autoDeploySettings.enabled) {
			return false;
		}

		const { workflowId, branch, workflowInputs } =
			this.settings.autoDeploySettings;

		if (!workflowId) {
			new Notice(
				"Auto-deployment is enabled but workflow ID is not configured.",
			);

			Logger.warn(
				"Auto-deployment is enabled but workflow ID is not configured",
			);

			return false;
		}

		try {
			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			const success = await userGardenConnection.triggerWorkflow(
				workflowId,
				branch,
				workflowInputs,
			);

			return success;
		} catch (error) {
			console.error("Failed to trigger deployment:", error);
			Logger.error("Failed to trigger deployment:", error);

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

			const remoteImageHashes = await this.getRemoteImageHashes();
			const notePathBase = getNotePathBase(this.settings);

			await userGardenConnection.updateFiles(
				filesToPublish,
				remoteImageHashes,
				notePathBase,
			);

			return true;
		} catch (error) {
			console.error(error);

			return false;
		}
	}

	private async getRemoteImageHashes(): Promise<Record<string, string>> {
		const userGardenConnection = new RepositoryConnection(
			await PublishPlatformConnectionFactory.createPublishPlatformConnection(
				this.settings,
			),
		);

		const contentTree = await userGardenConnection
			.getContent("HEAD")
			.catch(() => undefined);

		if (!contentTree) {
			return {};
		}

		const siteManager = new DigitalGardenSiteManager(
			this.metadataCache,
			this.settings,
		);

		return siteManager.getImageHashes(contentTree);
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

		// Get file frontmatter to determine type and year
		const cache = this.metadataCache.getCache(filePath);
		const frontmatter = cache ? cache.frontmatter : {};

		// Get configuration values
		const basePath =
			this.settings.publishBasePath || DEFAULT_NOTE_PATH_BASE;
		const typeKey = this.settings.typeDirectoryKey || "type";
		const subDirKey = this.settings.subDirectoryKey || "year";

		// Build path components
		let publishPath = basePath;

		// Add type directory if specified in frontmatter
		if (frontmatter && frontmatter[typeKey]) {
			publishPath = `${publishPath}/${frontmatter[typeKey]}`;
		}

		// Add subdirectory if specified in frontmatter
		if (frontmatter && frontmatter[subDirKey]) {
			// Extract only the first part of the year path to avoid duplicate directories
			const yearValue = String(frontmatter[subDirKey]).split("/")[0];
			publishPath = `${publishPath}/${yearValue}`;
		}

		// Add filename after applying path rewrite rules
		const gardenPath = getGardenPathForNote(filePath, this.rewriteRules);
		publishPath = `${publishPath}/${gardenPath}`;

		await this.uploadToGithub(publishPath, content, sha);
	}

	private async uploadImage(filePath: string, content: string, sha?: string) {
		const path = `src/site${filePath}`;
		await this.uploadToGithub(path, content, sha);
	}

	private async uploadAssets(
		assets: Assets,
		remoteImageHashes: Record<string, string> = {},
	) {
		for (const image of assets.images) {
			// Convert asset path to hash key: /img/user/attachments/image.png -> attachments/image.png
			const hashKey = image.path.replace("/img/user/", "");
			const remoteHash = remoteImageHashes[hashKey];

			// Skip if unchanged (local hash matches remote hash)
			if (
				remoteHash &&
				image.localHash &&
				remoteHash === image.localHash
			) {
				Logger.debug(`Skipping unchanged image: ${image.path}`);
				continue;
			}

			await this.uploadImage(image.path, image.content, remoteHash);
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
