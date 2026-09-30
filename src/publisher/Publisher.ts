import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { getRewriteRules } from "../utils/utils";
import {
	hasPublishFlag,
	isPublishFrontmatterValid,
} from "../publishFile/Validator";
import DigitalGardenSiteManager, {
	PathRewriteRules,
} from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { GardenPageCompiler } from "../compiler/GardenPageCompiler";
import { CompiledPublishFile, PublishFile } from "../publishFile/PublishFile";
import Logger from "js-logger";
import {
	RepositoryConnection,
	type PublishProgressCallback,
} from "../repositoryConnection/RepositoryConnection";
import PublishPlatformConnectionFactory from "src/repositoryConnection/PublishPlatformConnectionFactory";
import { PublishPlatform } from "../models/PublishPlatform";
import { LimitReachedError } from "../forestry/LimitReachedError";
import { imagePathBase, notePathBase } from "./paths";
import { describeError } from "../utils/debugLog";

export interface MarkedForPublishing {
	notes: PublishFile[];
	images: string[];
}

export interface PublishBatchResult {
	success: boolean;
	/** Human-readable description of what went wrong, safe to show in the UI. */
	error?: string;
}

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

	/**
	 * Publish one note and its changed images as a single commit, so it costs
	 * one build (and one Forestry publish) however many images it carries.
	 */
	public async publish(file: CompiledPublishFile): Promise<boolean> {
		if (!isPublishFrontmatterValid(file.frontmatter)) {
			return false;
		}

		try {
			this.validateSettings();

			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			const remoteImageHashes = await this.getRemoteImageHashes();

			const failedPaths = await userGardenConnection.updateFiles(
				[file],
				remoteImageHashes,
			);

			return failedPaths.length === 0;
		} catch (error) {
			if (error instanceof LimitReachedError) {
				throw error;
			}
			console.error(error);

			return false;
		}
	}

	/**
	 * Delete notes (vault paths) and images (vault paths) in as few commits
	 * as GitHub allows. Returns `success: false` with a description on error;
	 * whatever was committed before the failure stays deleted.
	 */
	public async deleteBatch(
		notePaths: string[],
		imagePaths: string[],
		onProgress?: PublishProgressCallback,
	): Promise<PublishBatchResult> {
		const repoPaths = [
			...notePaths.map((path) => notePathBase(this.settings) + path),
			...imagePaths.map((path) => imagePathBase(this.settings) + path),
		];

		if (repoPaths.length === 0) {
			return { success: true };
		}

		try {
			this.validateSettings();

			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			await userGardenConnection.deleteFiles(repoPaths, onProgress);

			return { success: true };
		} catch (error) {
			if (error instanceof LimitReachedError) {
				throw error;
			}
			Logger.error("Batch delete failed", error);

			return { success: false, error: describeError(error) };
		}
	}

	public async publishBatch(
		files: CompiledPublishFile[],
		onProgress?: PublishProgressCallback,
	): Promise<PublishBatchResult> {
		const filesToPublish = files.filter((f) =>
			isPublishFrontmatterValid(f.frontmatter),
		);

		if (filesToPublish.length === 0) {
			return { success: true };
		}

		try {
			const userGardenConnection = new RepositoryConnection(
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					this.settings,
				),
			);

			const remoteImageHashes = await this.getRemoteImageHashes();

			await userGardenConnection.updateFiles(
				filesToPublish,
				remoteImageHashes,
				onProgress,
			);

			return { success: true };
		} catch (error) {
			if (error instanceof LimitReachedError) {
				throw error;
			}
			Logger.error("Batch publish failed", error);

			return { success: false, error: describeError(error) };
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
