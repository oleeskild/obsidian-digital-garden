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

		const userGardenConnection = new RepositoryConnection({
			gardenRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
		});

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
			const userGardenConnection = new RepositoryConnection({
				gardenRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
			});

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
			const userGardenConnection = new RepositoryConnection({
				gardenRepository: this.settings.githubRepo,
				githubUserName: this.settings.githubUserName,
				githubToken: this.settings.githubToken,
			});

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

		const userGardenConnection = new RepositoryConnection({
			gardenRepository: this.settings.githubRepo,
			githubUserName: this.settings.githubUserName,
			githubToken: this.settings.githubToken,
		});

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
