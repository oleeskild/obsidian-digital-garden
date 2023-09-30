import Logger from "js-logger";
import DigitalGardenPluginInfo from "../models/pluginInfo";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "./RepositoryConnection";

import { Base64 } from "js-base64";
const logger = Logger.get("digital-garden-site-manager");

interface IUpdateFileInfo {
	path: string;
	sha?: string;
}

interface IUpdateCheckerProps {
	baseGardenConnection: RepositoryConnection;
	userGardenConnection: RepositoryConnection;
}

interface IUpdateProps extends IUpdateCheckerProps {
	filesToChange: IUpdateInfo;
	defaultBranch: string;
}

interface IUpdateInfo {
	filesToDelete: IUpdateFileInfo[];
	filesToUpdate: IUpdateFileInfo[];
	filesToAdd: IUpdateFileInfo[];
}

export class TemplateUpdateChecker {
	baseGardenConnection: RepositoryConnection;
	userGardenConnection: RepositoryConnection;
	defaultBranch?: string;

	constructor({
		baseGardenConnection,
		userGardenConnection,
	}: IUpdateCheckerProps) {
		this.baseGardenConnection = baseGardenConnection;
		this.userGardenConnection = userGardenConnection;
	}

	private getFileInfoFromContent(content: TRepositoryContent, path: string) {
		const file = content?.tree.find((x) => x.path === path);

		if (!file) {
			return null;
		}

		return file;
	}

	private getFilesToDelete(
		pluginInfo: DigitalGardenPluginInfo,
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
		pluginInfo: DigitalGardenPluginInfo,
		baseGardenFileList: NonNullable<TRepositoryContent>,
		userFileList: NonNullable<TRepositoryContent>,
	) {
		const filesToUpdate = [];

		for (const file of pluginInfo.filesToModify) {
			const currentFile = this.getFileInfoFromContent(userFileList, file);

			const baseFile = this.getFileInfoFromContent(
				baseGardenFileList,
				file,
			);

			if (!currentFile || currentFile?.sha !== baseFile?.sha) {
				filesToUpdate.push({ path: file, sha: currentFile?.sha });
			}
		}

		return filesToUpdate;
	}

	private getFilesToAdd(
		pluginInfo: DigitalGardenPluginInfo,
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

	async checkForUpdates() {
		const updateInfo = await this.getFilesToUpdate();

		if (!updateInfo) {
			return null;
		}

		return new TemplateUpdater({
			baseGardenConnection: this.baseGardenConnection,
			userGardenConnection: this.userGardenConnection,
			filesToChange: updateInfo,
			defaultBranch: this.defaultBranch as string,
		});
	}

	async getFilesToUpdate(): Promise<IUpdateInfo | null> {
		const { baseGardenFileList, pluginInfo } = await this.getPluginInfo(
			this.baseGardenConnection,
		);

		if (!baseGardenFileList) {
			throw new Error("Unable to get base garden file list");
		}

		const repoInfo = await this.baseGardenConnection.getRepositoryInfo();

		const defaultBranch = repoInfo?.default_branch;

		if (!defaultBranch) {
			throw new Error("Unable to get default branch");
		}
		this.defaultBranch = defaultBranch;

		const userFileList =
			await this.userGardenConnection.getContent(defaultBranch);

		if (!userFileList) {
			throw new Error("Unable to get user file list");
		}

		const filesToDelete = this.getFilesToDelete(pluginInfo, userFileList);

		const filesToUpdate = this.getPathsToModify(
			pluginInfo,
			baseGardenFileList,
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

	private async getPluginInfo(baseGardenConnection: RepositoryConnection) {
		logger.info("Getting plugin info");

		const pluginInfoResponse =
			await baseGardenConnection.getFile("plugin-info.json");

		const baseGardenFileList =
			await baseGardenConnection.getContent("main");

		if (!pluginInfoResponse) {
			throw new Error("Unable to get plugin info");
		}

		return {
			pluginInfo: JSON.parse(Base64.decode(pluginInfoResponse.content)),
			baseGardenFileList,
		};
	}
}

export class TemplateUpdater {
	filesToChange: IUpdateInfo;
	defaultBranch: string;
	baseGardenConnection: RepositoryConnection;
	userGardenConnection: RepositoryConnection;

	constructor({
		baseGardenConnection,
		userGardenConnection,
		filesToChange,
		defaultBranch,
	}: IUpdateProps) {
		this.filesToChange = filesToChange;
		this.defaultBranch = defaultBranch;
		this.baseGardenConnection = baseGardenConnection;
		this.userGardenConnection = userGardenConnection;
	}

	async updateFiles() {
		const { filesToDelete, filesToUpdate, filesToAdd } = this.filesToChange;

		const { branchName, templateVersion } = await this.createNewBranch();

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
			const pr = await this.userGardenConnection.octokit.request(
				"POST /repos/{owner}/{repo}/pulls",
				{
					...this.userGardenConnection.getBasePayload(),
					title: `Update template to version ${templateVersion}`,
					head: branchName,
					base: this.defaultBranch,
					body: `Update to latest template version.\n [Release Notes](https://github.com/oleeskild/digitalgarden/releases/tag/${templateVersion})`,
				},
			);

			return pr?.data?.html_url;
		} catch (e) {
			return "";
		}
	}

	private async createNewBranch(): Promise<{
		branchName: string;
		templateVersion: string;
	}> {
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

		await this.userGardenConnection.createBranch(
			branchName,
			latestCommit.sha,
		);

		return { branchName, templateVersion };
	}

	private async deleteFiles(
		filesToDelete: IUpdateFileInfo[],
		branch: string,
	) {
		for (const file of filesToDelete) {
			await this.userGardenConnection.deleteFile(file.path, {
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
			const baseTemplateFile = await this.baseGardenConnection.getFile(
				file.path,
			);

			if (!baseTemplateFile) {
				throw new Error(`Unable to get file ${file}`);
			}

			await this.userGardenConnection.updateFile({
				content: baseTemplateFile.content,
				path: file.path,
				branch: branch,
				sha: file.sha,
				message: "Update files",
			});
		}
	}
}
