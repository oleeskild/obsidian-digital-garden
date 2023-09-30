import type DigitalGardenSettings from "src/models/settings";
import { type MetadataCache, Notice, type TFile } from "obsidian";
import {
	extractBaseUrl,
	generateUrlPath,
	getGardenPathForNote,
	getRewriteRules,
} from "../utils/utils";
import { Octokit } from "@octokit/core";
import { Base64 } from "js-base64";
import type DigitalGardenPluginInfo from "../models/pluginInfo";
import { IMAGE_PATH_BASE, NOTE_PATH_BASE } from "./Publisher";
import { RepositoryConnection } from "./RepositoryConnection";
import Logger from "js-logger";

const logger = Logger.get("digital-garden-site-manager");
export interface PathRewriteRule {
	from: string;
	to: string;
}
export type PathRewriteRules = PathRewriteRule[];

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
	userGardenConnection: RepositoryConnection;
	constructor(metadataCache: MetadataCache, settings: DigitalGardenSettings) {
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);

		this.baseGardenConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: "oleeskild",
			gardenRepository: "digitalgarden",
		});

		this.userGardenConnection = new RepositoryConnection({
			githubToken: settings.githubToken,
			githubUserName: settings.githubUserName,
			gardenRepository: settings.githubRepo,
		});
	}

	async updateEnv() {
		const theme = JSON.parse(this.settings.theme);
		const baseTheme = this.settings.baseTheme;
		const siteName = this.settings.siteName;
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

		const currentFile = await this.userGardenConnection.getFile(".env");

		const decodedCurrentFile = Base64.decode(currentFile?.content ?? "");

		if (decodedCurrentFile === envSettings) {
			logger.info("No changes to .env file");

			new Notice("Settings already up to date!");

			return;
		}

		await this.userGardenConnection.updateFile({
			path: ".env",
			content: base64Settings,
			message: "Update settings",
			sha: currentFile?.sha,
		});
	}

	getNoteUrl(file: TFile): string {
		if (!this.settings.gardenBaseUrl) {
			new Notice("Please set the garden base url in the settings");

			// caught in copyUrlToClipboard
			throw new Error("Garden base url not set");
		}

		const baseUrl = `https://${extractBaseUrl(
			this.settings.gardenBaseUrl,
		)}`;

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
		const octokit = new Octokit({ auth: this.settings.githubToken });

		const response = await octokit.request(
			`GET /repos/{owner}/{repo}/contents/{path}`,
			{
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				path: NOTE_PATH_BASE + path,
			},
		);

		// @ts-expect-error data is not yet type-guarded
		const content = Base64.decode(response.data.content);

		return content;
	}

	async getNoteHashes(): Promise<Record<string, string>> {
		const octokit = new Octokit({ auth: this.settings.githubToken });

		// Force the cache to be updated
		const response = await octokit.request(
			`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=${Math.ceil(
				Math.random() * 1000,
			)}`,
			{
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				tree_sha: "HEAD",
			},
		);

		const files = response.data.tree;

		const notes: Array<{ path: string; sha: string }> = files.filter(
			(x: { path: string; type: string }) =>
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

	async getImageHashes(): Promise<Record<string, string>> {
		const octokit = new Octokit({ auth: this.settings.githubToken });

		// Force the cache to be updated
		const response = await octokit.request(
			`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=${Math.ceil(
				Math.random() * 1000,
			)}`,
			{
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				tree_sha: "HEAD",
			},
		);

		const files = response.data.tree;

		const images: Array<{ path: string; sha: string }> = files.filter(
			(x: { path: string; type: string }) =>
				x.path.startsWith(IMAGE_PATH_BASE) && x.type === "blob",
		);
		const hashes: Record<string, string> = {};

		for (const img of images) {
			const vaultPath = decodeURI(img.path.replace(IMAGE_PATH_BASE, ""));
			hashes[vaultPath] = img.sha;
		}

		return hashes;
	}

	/**
	 *
	 * @returns {Promise<string>} The url of the created PR. Null if unable to create PR.
	 */
	async createPullRequestWithSiteChanges(): Promise<string> {
		const octokit = new Octokit({ auth: this.settings.githubToken });

		const latestRelease =
			await this.baseGardenConnection.getLatestRelease();

		if (!latestRelease) {
			throw new Error(
				"Unable to get latest release from oleeskid repository",
			);
		}

		const templateVersion = latestRelease.tag_name;
		const uuid = crypto.randomUUID();

		const branchName =
			"update-template-to-v" + templateVersion + "-" + uuid;

		const latestCommit = await this.userGardenConnection.getLatestCommit();

		if (!latestCommit) {
			throw new Error("Unable to get latest commit");
		}

		await this.createNewBranch(octokit, branchName, latestCommit.sha);
		await this.deleteFiles(this.userGardenConnection, branchName);
		await this.addFilesIfMissing(this.userGardenConnection, branchName);
		await this.modifyFiles(this.userGardenConnection, branchName);

		const prUrl = await this.createPullRequest(
			octokit,
			branchName,
			templateVersion,
		);

		return prUrl;
	}

	private async createPullRequest(
		octokit: Octokit,
		branchName: string,
		templateVersion: string,
	): Promise<string> {
		logger.info(`Creating PR for branch ${branchName}`);

		try {
			const repoInfo = await octokit.request(
				"GET /repos/{owner}/{repo}",
				{
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
				},
			);

			const defaultBranch = repoInfo.data.default_branch;

			const pr = await octokit.request(
				"POST /repos/{owner}/{repo}/pulls",
				{
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
					title: `Update template to version ${templateVersion}`,
					head: branchName,
					base: defaultBranch,
					body: `Update to latest template version.\n [Release Notes](https://github.com/oleeskild/digitalgarden/releases/tag/${templateVersion})`,
				},
			);

			return pr.data.html_url;
		} catch (error) {
			logger.error(error);

			if (
				(error as { message?: string })?.message?.includes(
					"No commits between main and",
				)
			) {
				logger.warn("No changes to commit");

				return "";
			}
			throw error;
		}
	}

	private async deleteFiles(
		userGardenConnection: RepositoryConnection,
		branchName: string,
	) {
		logger.info("Deleting files");
		const pluginInfo = await this.getPluginInfo(this.baseGardenConnection);

		const filesToDelete = pluginInfo.filesToDelete;

		for (const file of filesToDelete) {
			await userGardenConnection
				.deleteFile(file, {
					branch: branchName,
				})
				.catch(() => {});
		}
	}

	private async modifyFiles(
		userGardenConnection: RepositoryConnection,
		branchName: string,
	) {
		logger.info("Modifying changed files");

		const pluginInfo = await this.getPluginInfo(this.baseGardenConnection);
		const filesToModify = pluginInfo.filesToModify;

		for (const file of filesToModify) {
			const latestFile = await this.baseGardenConnection.getFile(file);

			if (!latestFile) {
				throw new Error(`Unable to get file ${file} from base garden`);
			}

			const fileFromRepository = await userGardenConnection
				.getFile(file, branchName)
				.catch(() => {});

			const fileHasChanged = latestFile.sha !== fileFromRepository?.sha;

			if (!fileFromRepository || fileHasChanged) {
				logger.info(
					`updating file ${file} because ${
						fileHasChanged
							? "it has changed"
							: "it does not exist yet"
					}`,
				);

				userGardenConnection.updateFile({
					path: file,
					content: latestFile.content,
					branch: branchName,
					sha: fileFromRepository?.sha,
				});
			}
		}
	}

	private async createNewBranch(
		octokit: Octokit,
		branchName: string,
		sha: string,
	) {
		logger.info(`Creating new branch: ${branchName} to update template`);

		try {
			await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				ref: `refs/heads/${branchName}`,
				sha,
			});
		} catch (e) {
			logger.info(`branch already exists!`);
		}
	}

	private async addFilesIfMissing(
		userGardenConnection: RepositoryConnection,
		branchName: string,
	) {
		logger.info("Adding missing files");
		// Should only be added if it does not exist yet. Otherwise leave it alone
		const pluginInfo = await this.getPluginInfo(this.baseGardenConnection);
		const filesToAdd = pluginInfo.filesToAdd;

		for (const filePath of filesToAdd) {
			const userFile = userGardenConnection.getFile(filePath, branchName);

			if (!userFile) {
				// Create from baseGarden
				const initialFile =
					await this.baseGardenConnection.getFile(filePath);

				if (!initialFile) {
					throw new Error(
						`Unable to get file ${filePath} from base garden`,
					);
				}

				await userGardenConnection.updateFile({
					path: filePath,
					content: initialFile.content,
					branch: branchName,
				});
			}
		}
	}

	private async getPluginInfo(
		baseGardenConnection: RepositoryConnection,
	): Promise<DigitalGardenPluginInfo> {
		const pluginInfoResponse =
			await baseGardenConnection.getFile("plugin-info.json");

		if (!pluginInfoResponse) {
			throw new Error("Unable to get plugin info");
		}

		return JSON.parse(Base64.decode(pluginInfoResponse.content));
	}
}
