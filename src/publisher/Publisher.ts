import { MetadataCache, Notice, TFile, Vault } from "obsidian";
import { Base64 } from "js-base64";
import { Octokit } from "@octokit/core";
import { getRewriteRules } from "../utils/utils";
import { isPublishFrontmatterValid } from "./Validator";
import { PathRewriteRules } from "./DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { Assets, GardenPageCompiler } from "../compiler/GardenPageCompiler";

export interface MarkedForPublishing {
	notes: TFile[];
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
			this.getFilesMarkedForPublishing,
		);
	}

	async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
		const files = this.vault.getMarkdownFiles();
		const notesToPublish: TFile[] = [];
		const imagesToPublish: Set<string> = new Set();

		for (const file of files) {
			try {
				const frontMatter = this.metadataCache.getCache(file.path)
					?.frontmatter;

				if (frontMatter && frontMatter["dg-publish"] === true) {
					notesToPublish.push(file);

					const images = await this.compiler.extractImageLinks(
						await this.vault.cachedRead(file),
						file.path,
					);
					images.forEach((i) => imagesToPublish.add(i));
				}
			} catch {
				//ignore
			}
		}

		return {
			notes: notesToPublish,
			images: Array.from(imagesToPublish),
		};
	}

	async deleteNote(vaultFilePath: string) {
		const path = `${NOTE_PATH_BASE}${vaultFilePath}`;

		return await this.delete(path);
	}

	async deleteImage(vaultFilePath: string) {
		const path = `${IMAGE_PATH_BASE}${vaultFilePath}`;

		return await this.delete(path);
	}

	async delete(path: string): Promise<boolean> {
		this.validateSettings();
		const octokit = new Octokit({ auth: this.settings.githubToken });

		const payload = {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
			path,
			message: `Delete content ${path}`,
			sha: "",
		};

		try {
			const response = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
					path,
				},
			);

			// @ts-expect-error TODO: abstract octokit response
			if (response.status === 200 && response?.data.type === "file") {
				// @ts-expect-error TODO: abstract octokit response
				payload.sha = response.data.sha;
			}
		} catch (e) {
			console.log(e);

			return false;
		}

		try {
			await octokit.request(
				"DELETE /repos/{owner}/{repo}/contents/{path}",
				payload,
			);
		} catch (e) {
			console.log(e);

			return false;
		}

		return true;
	}

	async publish(file: TFile): Promise<boolean> {
		if (
			!isPublishFrontmatterValid(
				this.metadataCache.getCache(file.path)?.frontmatter,
			)
		) {
			return false;
		}

		try {
			const [text, assets] = await this.compiler.generateMarkdown(file);
			await this.uploadText(file.path, text);
			await this.uploadAssets(assets);

			return true;
		} catch {
			return false;
		}
	}

	async uploadToGithub(path: string, content: string) {
		this.validateSettings();

		const octokit = new Octokit({ auth: this.settings.githubToken });

		const payload = {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
			path,
			message: `Add content ${path}`,
			content,
			sha: "",
		};

		try {
			const response = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
					path,
				},
			);

			// @ts-expect-error TODO: abstract octokit response
			if (response.status === 200 && response.data.type === "file") {
				// @ts-expect-error TODO: abstract octokit response
				payload.sha = response.data.sha;
			}
		} catch (e) {
			console.log(e);
		}

		payload.message = `Update content ${path}`;

		await octokit.request(
			"PUT /repos/{owner}/{repo}/contents/{path}",
			payload,
		);
	}

	async uploadText(filePath: string, content: string) {
		content = Base64.encode(content);
		const path = `${NOTE_PATH_BASE}${filePath}`;
		await this.uploadToGithub(path, content);
	}

	async uploadImage(filePath: string, content: string) {
		const path = `src/site${filePath}`;
		await this.uploadToGithub(path, content);
	}

	async uploadAssets(assets: Assets) {
		for (let idx = 0; idx < assets.images.length; idx++) {
			const image = assets.images[idx];
			await this.uploadImage(image.path, image.content);
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
