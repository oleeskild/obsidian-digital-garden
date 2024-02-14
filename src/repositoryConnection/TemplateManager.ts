import Logger from "js-logger";
import QuartzSyncerPluginInfo from "../models/pluginInfo";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "./RepositoryConnection";

import { Base64 } from "js-base64";
const logger = Logger.get("quartz-syncer-site-manager");

interface IUpdateFileInfo {
	path: string;
	sha?: string;
}

interface IUpdateCheckerProps {
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;
}

interface IUpdateProps extends IUpdateCheckerProps {
	filesToChange: IUpdateInfo;
	defaultBranch: string;
	newestTemplateVersion: string;
}

interface IUpdateInfo {
	filesToDelete: IUpdateFileInfo[];
	filesToUpdate: IUpdateFileInfo[];
	filesToAdd: IUpdateFileInfo[];
}

export class TemplateUpdateChecker {
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;
	defaultBranch?: string;
	newestTemplateVersion?: string;

	constructor({
		baseSyncerConnection,
		userSyncerConnection,
	}: IUpdateCheckerProps) {
		this.baseSyncerConnection = baseSyncerConnection;
		this.userSyncerConnection = userSyncerConnection;
	}

	private getFileInfoFromContent(content: TRepositoryContent, path: string) {
		const file = content?.tree.find((x) => x.path === path);

		if (!file) {
			return null;
		}

		return file;
	}

	private getFilesToDelete(
		pluginInfo: QuartzSyncerPluginInfo,
		userFileList: NonNullable<TRepositoryContent>,
	) {
		const filesToDelete = [];

		for (const file of pluginInfo.filesToDelete) {
			const currentFile = this.getFileInfoFromContent(userFileList, file);

			if (currentFile) {
				filesToDelete.push({ path: file, sha: currentFile.sha });
			}
		}

		return filesToDelete;
	}
	private getPathsToModify(
		pluginInfo: QuartzSyncerPluginInfo,
		baseSyncerFileList: NonNullable<TRepositoryContent>,
		userFileList: NonNullable<TRepositoryContent>,
	) {
		const filesToUpdate = [];

		for (const file of pluginInfo.filesToModify) {
			const currentFile = this.getFileInfoFromContent(userFileList, file);

			const baseFile = this.getFileInfoFromContent(
				baseSyncerFileList,
				file,
			);

			if (!currentFile || currentFile?.sha !== baseFile?.sha) {
				filesToUpdate.push({ path: file, sha: currentFile?.sha });
			}
		}

		return filesToUpdate;
	}

	private getFilesToAdd(
		pluginInfo: QuartzSyncerPluginInfo,
		userFileList: NonNullable<TRepositoryContent>,
	) {
		const filesToAdd = [];

		for (const file of pluginInfo.filesToAdd) {
			const currentFile = this.getFileInfoFromContent(userFileList, file);

			if (!currentFile) {
				filesToAdd.push({ path: file });
			}
		}

		return filesToAdd;
	}

	async getTemplateVersion() {
		const latestRelease =
			await this.baseSyncerConnection.getLatestRelease();

		if (!latestRelease) {
			throw new Error(
				"Unable to get latest release from oleeskid repository",
			);
		}

		return latestRelease.tag_name;
	}

	async checkForUpdates() {
		const [updateInfo, templateVersion] = await Promise.all([
			this.getFilesToUpdate(),
			this.getTemplateVersion(),
		]);

		if (!templateVersion) {
			throw new Error("Unable to get update info");
		}

		if (!updateInfo) {
			this.newestTemplateVersion = templateVersion;

			return this;
		}

		this.newestTemplateVersion = templateVersion;

		return new TemplateUpdater({
			baseSyncerConnection: this.baseSyncerConnection,
			userSyncerConnection: this.userSyncerConnection,
			filesToChange: updateInfo,
			defaultBranch: this.defaultBranch as string,
			newestTemplateVersion: templateVersion,
		});
	}

	async getFilesToUpdate(): Promise<IUpdateInfo | null> {
		const { baseSyncerFileList, pluginInfo } = await this.getPluginInfo(
			this.baseSyncerConnection,
		);

		if (!baseSyncerFileList) {
			throw new Error("Unable to get base garden file list");
		}

		const repoInfo = await this.baseSyncerConnection.getRepositoryInfo();

		const defaultBranch = repoInfo?.default_branch;

		if (!defaultBranch) {
			throw new Error("Unable to get default branch");
		}
		this.defaultBranch = defaultBranch;

		const userFileList =
			await this.userSyncerConnection.getContent(defaultBranch);

		if (!userFileList) {
			throw new Error("Unable to get user file list");
		}

		const filesToDelete = this.getFilesToDelete(pluginInfo, userFileList);

		const filesToUpdate = this.getPathsToModify(
			pluginInfo,
			baseSyncerFileList,
			userFileList,
		);

		const filesToAdd = this.getFilesToAdd(pluginInfo, userFileList);

		if (
			filesToDelete.length === 0 &&
			filesToUpdate.length === 0 &&
			filesToAdd.length === 0
		) {
			return null;
		}

		return {
			filesToDelete,
			filesToUpdate,
			filesToAdd,
		};
	}

	private async getPluginInfo(baseSyncerConnection: RepositoryConnection) {
		logger.info("Getting plugin info");

		const pluginInfoResponse =
			await baseSyncerConnection.getFile("plugin-info.json");

		const baseSyncerFileList =
			await baseSyncerConnection.getContent("main");

		if (!pluginInfoResponse) {
			throw new Error("Unable to get plugin info");
		}

		return {
			pluginInfo: JSON.parse(Base64.decode(pluginInfoResponse.content)),
			baseSyncerFileList,
		};
	}
}

/**
 * Note: it might not make sense anymore to list changed/deleted/added files
 * option 1: migrations for versions
 * option 2: just a list of files to check
 * option 3: give sha for each expected file and check them (maybe best for now?)
 */

export class TemplateUpdater {
	filesToChange: IUpdateInfo;
	defaultBranch: string;
	baseSyncerConnection: RepositoryConnection;
	userSyncerConnection: RepositoryConnection;
	newestTemplateVersion: string;

	constructor({
		baseSyncerConnection,
		userSyncerConnection,
		filesToChange,
		defaultBranch,
		newestTemplateVersion,
	}: IUpdateProps) {
		this.filesToChange = filesToChange;
		this.defaultBranch = defaultBranch;
		this.baseSyncerConnection = baseSyncerConnection;
		this.userSyncerConnection = userSyncerConnection;
		this.newestTemplateVersion = newestTemplateVersion;
	}

	async updateTemplate() {
		const { filesToDelete, filesToUpdate, filesToAdd } = this.filesToChange;

		const { branchName } = await this.createNewBranch();

		logger.info("Deleting files");
		await this.deleteFiles(filesToDelete, branchName);

		logger.info("Updating files");

		// todo get unique files (no add without sha then update)
		await this.addOrUpdateFiles(
			[...filesToUpdate, ...filesToAdd],
			branchName,
		);

		logger.info("Adding files");
		await this.addOrUpdateFiles(filesToAdd, branchName);

		try {
			const pr = await this.userSyncerConnection.octokit.request(
				"POST /repos/{owner}/{repo}/pulls",
				{
					...this.userSyncerConnection.getBasePayload(),
					title: `Update template to version ${this.newestTemplateVersion}`,
					head: branchName,
					base: this.defaultBranch,
					body: `Update to latest template version.\n [Release Notes](https://github.com/saberzero1/quartz-syncer/releases/tag/${this.newestTemplateVersion})`,
				},
			);

			return pr?.data?.html_url;
		} catch (e) {
			return "";
		}
	}

	private async createNewBranch(): Promise<{
		branchName: string;
	}> {
		const uuid = crypto.randomUUID();

		const branchName =
			"update-template-to-v" + this.newestTemplateVersion + "-" + uuid;

		const latestCommit = await this.userSyncerConnection.getLatestCommit();

		if (!latestCommit) {
			throw new Error("Unable to get latest commit");
		}

		await this.userSyncerConnection.createBranch(
			branchName,
			latestCommit.sha,
		);

		return { branchName };
	}

	private async deleteFiles(
		filesToDelete: IUpdateFileInfo[],
		branch: string,
	) {
		for (const file of filesToDelete) {
			await this.userSyncerConnection.deleteFile(file.path, {
				branch,
				sha: file.sha,
			});
		}
	}

	private async addOrUpdateFiles(
		filesToAdd: IUpdateFileInfo[],
		branch: string,
	) {
		for (const file of filesToAdd) {
			const baseTemplateFile = await this.baseSyncerConnection.getFile(
				file.path,
			);

			if (!baseTemplateFile) {
				throw new Error(`Unable to get file ${file}`);
			}

			await this.userSyncerConnection.updateFile({
				content: baseTemplateFile.content,
				path: file.path,
				branch: branch,
				sha: file.sha,
				message: "Update files",
			});
		}
	}
}

export const hasUpdates = (
	updater: TemplateUpdater | TemplateUpdateChecker,
): updater is TemplateUpdater =>
	(updater as TemplateUpdater).filesToChange !== undefined;
