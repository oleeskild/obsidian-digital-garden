import Logger from "js-logger";
import DigitalGardenPluginInfo from "../models/pluginInfo";
import {
	RepositoryConnection,
	TRepositoryContent,
} from "./RepositoryConnection";

import { Base64 } from "js-base64";
const logger = Logger.get("digital-garden-site-manager");

/**
 * Written (under the content base directory) by every template update PR,
 * holding the template release it brought the garden to. Lets "is there an
 * update?" be a version comparison, so customized template files no longer
 * look like a pending update forever (oleeskild/digitalgarden#408).
 */
export const TEMPLATE_VERSION_FILE = ".digitalgarden-template-version";

/**
 * Compare release tags like `1.93.0` / `v1.93.0`. Returns > 0 when `a` is
 * newer. Tags that are not plain dotted numbers count as newer when they
 * differ, so an unexpected tag errs towards offering the update.
 */
export const compareTemplateVersions = (a: string, b: string): number => {
	const parse = (version: string) =>
		version.trim().replace(/^v/, "").split(".").map(Number);

	const [partsA, partsB] = [parse(a), parse(b)];

	if ([...partsA, ...partsB].some(Number.isNaN)) {
		return a.trim() === b.trim() ? 0 : 1;
	}

	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);

		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
};

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
	newestTemplateVersion: string;
	/**
	 * Whether a newer template release exists. `false` means the garden is on
	 * the latest version but some template files differ (usually the user's
	 * own customizations); the updater can then re-apply the template.
	 */
	updateAvailable?: boolean;
	/** Version from {@link TEMPLATE_VERSION_FILE}; unset for older gardens. */
	installedVersion?: string;
}

interface IUpdateInfo {
	filesToDelete: IUpdateFileInfo[];
	filesToUpdate: IUpdateFileInfo[];
	filesToAdd: IUpdateFileInfo[];
}

export class TemplateUpdateChecker {
	baseGardenConnection: RepositoryConnection;
	userGardenConnection: RepositoryConnection;
	newestTemplateVersion?: string;
	installedVersion?: string;

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

	/**
	 * Template file paths (from plugin-info.json) are relative to the template root.
	 * In the user's repo the template may live under a content base directory, so
	 * lookups and writes there must be prefixed. IUpdateFileInfo paths stay
	 * template-relative; the prefix is applied at the user-repo boundary only.
	 */
	private get userContentBase(): string {
		return this.userGardenConnection.contentBaseDir;
	}

	private getFilesToDelete(
		pluginInfo: DigitalGardenPluginInfo,
		userFileList: NonNullable<TRepositoryContent>,
	) {
		const filesToDelete = [];

		for (const file of pluginInfo.filesToDelete) {
			const currentFile = this.getFileInfoFromContent(
				userFileList,
				this.userContentBase + file,
			);

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
			const currentFile = this.getFileInfoFromContent(
				userFileList,
				this.userContentBase + file,
			);

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
			const currentFile = this.getFileInfoFromContent(
				userFileList,
				this.userContentBase + file,
			);

			if (!currentFile) {
				filesToAdd.push({ path: file });
			}
		}

		return filesToAdd;
	}

	async getTemplateVersion() {
		const latestRelease =
			await this.baseGardenConnection.getLatestRelease();

		if (!latestRelease) {
			throw new Error(
				"Unable to get latest release from oleeskid repository",
			);
		}

		return latestRelease.tag_name;
	}

	/**
	 * With a {@link TEMPLATE_VERSION_FILE} in the garden, an update is
	 * available only when a newer release exists; differing template files on
	 * the latest version are reported as re-applicable, not as an update.
	 * Gardens without the file (never updated since it was introduced) fall
	 * back to "any template file differs means update".
	 *
	 * Returns a {@link TemplateUpdater} when there is anything to apply,
	 * otherwise the checker itself.
	 */
	async checkForUpdates() {
		const [{ updateInfo, installedVersion }, templateVersion] =
			await Promise.all([
				this.inspectUserGarden(),
				this.getTemplateVersion(),
			]);

		if (!templateVersion) {
			throw new Error("Unable to get update info");
		}

		this.newestTemplateVersion = templateVersion;
		this.installedVersion = installedVersion;

		const updateAvailable = installedVersion
			? compareTemplateVersions(templateVersion, installedVersion) > 0
			: updateInfo !== null;

		if (!updateAvailable && !updateInfo) {
			return this;
		}

		return new TemplateUpdater({
			baseGardenConnection: this.baseGardenConnection,
			userGardenConnection: this.userGardenConnection,
			filesToChange: updateInfo ?? {
				filesToDelete: [],
				filesToUpdate: [],
				filesToAdd: [],
			},
			newestTemplateVersion: templateVersion,
			updateAvailable,
			installedVersion,
		});
	}

	async getFilesToUpdate(): Promise<IUpdateInfo | null> {
		return (await this.inspectUserGarden()).updateInfo;
	}

	private async inspectUserGarden(): Promise<{
		updateInfo: IUpdateInfo | null;
		installedVersion?: string;
	}> {
		const { baseGardenFileList, pluginInfo } = await this.getPluginInfo(
			this.baseGardenConnection,
		);

		if (!baseGardenFileList) {
			throw new Error("Unable to get base garden file list");
		}

		const userFileList = await this.userGardenConnection.getContent("HEAD");

		if (!userFileList) {
			throw new Error("Unable to get user file list");
		}

		const installedVersion = await this.getInstalledVersion(userFileList);

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
			return { updateInfo: null, installedVersion };
		}

		return {
			updateInfo: { filesToDelete, filesToUpdate, filesToAdd },
			installedVersion,
		};
	}

	private async getInstalledVersion(
		userFileList: NonNullable<TRepositoryContent>,
	): Promise<string | undefined> {
		const versionFile = this.getFileInfoFromContent(
			userFileList,
			this.userContentBase + TEMPLATE_VERSION_FILE,
		);

		if (!versionFile?.sha) {
			return undefined;
		}

		const content = await this.userGardenConnection.getBlob(
			versionFile.sha,
		);

		return content ? Base64.decode(content).trim() || undefined : undefined;
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

/**
 * Note: it might not make sense anymore to list changed/deleted/added files
 * option 1: migrations for versions
 * option 2: just a list of files to check
 * option 3: give sha for each expected file and check them (maybe best for now?)
 */

export class TemplateUpdater {
	filesToChange: IUpdateInfo;
	baseGardenConnection: RepositoryConnection;
	userGardenConnection: RepositoryConnection;
	newestTemplateVersion: string;
	updateAvailable: boolean;
	installedVersion?: string;

	constructor({
		baseGardenConnection,
		userGardenConnection,
		filesToChange,
		newestTemplateVersion,
		updateAvailable = true,
		installedVersion,
	}: IUpdateProps) {
		this.filesToChange = filesToChange;
		this.baseGardenConnection = baseGardenConnection;
		this.userGardenConnection = userGardenConnection;
		this.newestTemplateVersion = newestTemplateVersion;
		this.updateAvailable = updateAvailable;
		this.installedVersion = installedVersion;
	}

	/** Number of template files the update would add, change or delete. */
	get changedFileCount(): number {
		const { filesToDelete, filesToUpdate, filesToAdd } = this.filesToChange;

		return filesToDelete.length + filesToUpdate.length + filesToAdd.length;
	}

	private get versionFileAddition() {
		return {
			path:
				this.userGardenConnection.contentBaseDir +
				TEMPLATE_VERSION_FILE,
			content: Base64.encode(`${this.newestTemplateVersion}\n`),
		};
	}

	/**
	 * Record the latest template version without touching any template file,
	 * as a direct commit to the garden's branch. For gardens from before
	 * {@link TEMPLATE_VERSION_FILE} whose customized files would otherwise
	 * keep reporting an update.
	 */
	async markAsUpToDate() {
		await this.userGardenConnection.commitChanges({
			additions: [this.versionFileAddition],
			message: `Mark template as version ${this.newestTemplateVersion}`,
		});
	}

	/**
	 * Open a pull request that brings the garden up to the template version.
	 *
	 * The whole update is one commit: every template file is fetched first,
	 * then blobs, tree and commit are created on top of the garden branch's
	 * tip, and only then is the update branch created pointing at it. A
	 * failure part way (e.g. a GitHub 429) therefore leaves no half-updated
	 * branch behind; retrying starts from a clean slate.
	 */
	async updateTemplate() {
		const { filesToDelete, filesToUpdate, filesToAdd } = this.filesToChange;
		const contentBaseDir = this.userGardenConnection.contentBaseDir;

		// The update is a pull request into the garden's own branch: the
		// publish branch when one is set, otherwise the default branch.
		const baseBranch = await this.userGardenConnection.getWriteBranch();

		const latestCommit =
			await this.userGardenConnection.getLatestCommit(baseBranch);

		if (!latestCommit) {
			throw new Error("Unable to get latest commit");
		}

		logger.info("Fetching template files");

		const templateAdditions = await Promise.all(
			[...filesToUpdate, ...filesToAdd].map(async (file) => {
				// Content comes from the base template repo (template-relative
				// path), but lands in the user's repo under its content base
				// directory.
				const baseTemplateFile =
					await this.baseGardenConnection.getFile(file.path);

				if (!baseTemplateFile) {
					throw new Error(`Unable to get file ${file.path}`);
				}

				return {
					path: contentBaseDir + file.path,
					// The contents API wraps base64 in newlines.
					content: baseTemplateFile.content.replace(/\s/g, ""),
				};
			}),
		);

		logger.info("Committing template update");

		const title = this.updateAvailable
			? `Update template to version ${this.newestTemplateVersion}`
			: `Re-apply template version ${this.newestTemplateVersion}`;

		const commitSha = await this.userGardenConnection.createCommit({
			additions: [...templateAdditions, this.versionFileAddition],
			deletions: filesToDelete.map((file) => contentBaseDir + file.path),
			message: title,
			parent: latestCommit,
		});

		const branchName =
			"update-template-to-v" +
			this.newestTemplateVersion +
			"-" +
			crypto.randomUUID();

		await this.userGardenConnection.createBranch(branchName, commitSha);

		try {
			const pr = await this.userGardenConnection.octokit.request(
				"POST /repos/{owner}/{repo}/pulls",
				{
					...this.userGardenConnection.getBasePayload(),
					title,
					head: branchName,
					base: baseBranch,
					body: `Update to latest template version.\n [Release Notes](https://github.com/oleeskild/digitalgarden/releases/tag/${this.newestTemplateVersion})`,
				},
			);

			return pr?.data?.html_url;
		} catch (e) {
			return "";
		}
	}
}

/** A newer template release is available for the garden. */
export const hasUpdates = (
	updater: TemplateUpdater | TemplateUpdateChecker,
): boolean => updater instanceof TemplateUpdater && updater.updateAvailable;

/** There is something to apply: a newer release or differing template files. */
export const canApplyTemplate = (
	updater: TemplateUpdater | TemplateUpdateChecker,
): updater is TemplateUpdater => updater instanceof TemplateUpdater;
