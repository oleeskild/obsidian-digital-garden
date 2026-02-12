import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { IPublishPlatformConnection } from "src/models/IPublishPlatformConnection";
import { getGardenPathForNote } from "../utils/utils";
import { PathRewriteRules } from "./DigitalGardenSiteManager";

const logger = Logger.get("repository-connection");

// Path constants - these are used as fallbacks
const IMAGE_PATH_BASE = "src/site/";
const DEFAULT_NOTE_PATH_BASE = "src/site/notes/";

interface IPutPayload {
	path: string;
	sha?: string;
	content: string;
	branch?: string;
	message?: string;
}

export class RepositoryConnection {
	private userName: string;
	private pageName: string;
	octokit: Octokit;

	constructor({ octoKit, userName, pageName }: IPublishPlatformConnection) {
		this.pageName = pageName;
		this.userName = userName;
		this.octokit = octoKit;
	}

	getRepositoryName() {
		return this.userName + "/" + this.pageName;
	}

	getBasePayload() {
		return {
			owner: this.userName,
			repo: this.pageName,
		};
	}

	/** Get filetree with path and sha of each file from repository */
	async getContent(branch: string) {
		try {
			const response = await this.octokit.request(
				`GET /repos/{owner}/{repo}/git/trees/{tree_sha}`,
				{
					...this.getBasePayload(),
					tree_sha: branch,
					recursive: "true",
					// invalidate cache
					headers: {
						"If-None-Match": "",
					},
				},
			);

			if (response.status === 200) {
				return response.data;
			}
		} catch (error) {
			throw new Error(
				`Could not get file ${""} from repository ${this.getRepositoryName()}`,
			);
		}
	}

	async getFile(path: string, branch?: string) {
		logger.info(
			`Getting file ${path} from repository ${this.getRepositoryName()}`,
		);

		try {
			const response = await this.octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					...this.getBasePayload(),
					path,
					ref: branch,
				},
			);

			if (
				response.status === 200 &&
				!Array.isArray(response.data) &&
				response.data.type === "file"
			) {
				return response.data;
			}
		} catch (error) {
			throw new Error(
				`Could not get file ${path} from repository ${this.getRepositoryName()}`,
			);
		}
	}

	async deleteFile(
		path: string,
		{ branch, sha }: { branch?: string; sha?: string },
	) {
		try {
			sha ??= await this.getFile(path, branch).then((file) => file?.sha);

			if (!sha) {
				console.error(
					`cannot find file ${path} on github, not removing`,
				);

				return false;
			}

			const payload = {
				...this.getBasePayload(),
				path,
				message: `Delete content ${path}`,
				sha,
				branch,
			};

			const result = await this.octokit.request(
				"DELETE /repos/{owner}/{repo}/contents/{path}",
				payload,
			);

			Logger.info(
				`Deleted file ${path} from repository ${this.getRepositoryName()}`,
			);

			return result;
		} catch (error) {
			logger.error(error);

			return false;
		}
	}

	async getLatestRelease() {
		try {
			const release = await this.octokit.request(
				"GET /repos/{owner}/{repo}/releases/latest",
				this.getBasePayload(),
			);

			if (!release || !release.data) {
				logger.error("Could not get latest release");
			}

			return release.data;
		} catch (error) {
			logger.error("Could not get latest release", error);
		}
	}

	async getLatestCommit(): Promise<
		{ sha: string; commit: { tree: { sha: string } } } | undefined
	> {
		try {
			const latestCommit = await this.octokit.request(
				`GET /repos/{owner}/{repo}/commits/HEAD?cacheBust=${Date.now()}`,
				this.getBasePayload(),
			);

			if (!latestCommit || !latestCommit.data) {
				logger.error("Could not get latest commit");
			}

			return latestCommit.data;
		} catch (error) {
			logger.error("Could not get latest commit", error);
		}
	}

	async updateFile({ path, sha, content, branch, message }: IPutPayload) {
		const payload = {
			...this.getBasePayload(),
			path,
			message: message ?? `Update file ${path}`,
			content,
			sha,
			branch,
		};

		try {
			return await this.octokit.request(
				"PUT /repos/{owner}/{repo}/contents/{path}",
				payload,
			);
		} catch (error) {
			logger.error(error);
		}
	}

	/**
	 * Delete multiple files in a single commit
	 * @param filePaths - Array of file paths to delete
	 * @param notePathBase - The base path for notes (e.g., "src/content/")
	 */
	async deleteFiles(filePaths: string[], notePathBase?: string) {
		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			logger.error("Could not get latest commit");

			return;
		}

		const normalizePath = (path: string) =>
			path.startsWith("/") ? path.slice(1) : path;

		const noteBase = notePathBase || DEFAULT_NOTE_PATH_BASE;

		const filesToDelete = filePaths.map((path) => {
			if (path.endsWith(".md")) {
				return `${noteBase}${normalizePath(path)}`;
			}

			return `${IMAGE_PATH_BASE}${normalizePath(path)}`;
		});

		const repoDataPromise = this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const latestCommitSha = latestCommit.sha;
		const baseTreeSha = latestCommit.commit.tree.sha;

		const baseTree = await this.octokit.request(
			"GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1",
			{
				...this.getBasePayload(),
				tree_sha: baseTreeSha,
			},
		);

		const newTreeEntries = baseTree.data.tree
			.filter(
				(item: { path: string }) => !filesToDelete.includes(item.path),
			) // Exclude files to delete
			.map(
				(item: {
					path: string;
					mode: string;
					type: string;
					sha: string;
				}) => ({
					path: item.path,
					mode: item.mode,
					type: item.type,
					sha: item.sha,
				}),
			);

		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				tree: newTreeEntries,
			},
		);

		const commitMessage = "Deleted multiple files";

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message: commitMessage,
				tree: newTree.data.sha,
				parents: [latestCommitSha],
			},
		);

		const defaultBranch = (await repoDataPromise).data.default_branch;

		await this.octokit.request(
			"PATCH /repos/{owner}/{repo}/git/refs/{ref}",
			{
				...this.getBasePayload(),
				ref: `heads/${defaultBranch}`,
				sha: newCommit.data.sha,
			},
		);
	}

	/**
	 * Update multiple files in a single commit
	 * @param files - Array of files to update
	 * @param remoteImageHashes - Map of image hashes to check for changes
	 * @param notePathBase - The base path for notes (e.g., "src/content/")
	 * @param rewriteRules - Path rewrite rules to apply to file paths
	 */
	async updateFiles(
		files: CompiledPublishFile[],
		remoteImageHashes: Record<string, string> = {},
		notePathBase?: string,
		rewriteRules?: PathRewriteRules,
	) {
		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			logger.error("Could not get latest commit");

			return;
		}

		const repoDataPromise = this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const latestCommitSha = latestCommit.sha;
		const baseTreeSha = latestCommit.commit.tree.sha;

		const normalizePath = (path: string) =>
			path.startsWith("/") ? path.slice(1) : path;

		const noteBase = notePathBase || DEFAULT_NOTE_PATH_BASE;

		const treePromises = files.map(async (file) => {
			const [text, _] = file.compiledFile;

			try {
				const blob = await this.octokit.request(
					"POST /repos/{owner}/{repo}/git/blobs",
					{
						...this.getBasePayload(),
						content: text,
						encoding: "utf-8",
					},
				);

				// 应用路径重写规则

				const filePath = file.getPath();

				const rewrittenPath = rewriteRules
					? getGardenPathForNote(filePath, rewriteRules)
					: filePath;

				return {
					path: `${noteBase}${normalizePath(rewrittenPath)}`,
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				logger.error(error);
			}
		});

		// Filter out unchanged images before creating blobs
		const allImages = files.flatMap((x) => x.compiledFile[1].images);

		const imagesToUpload = allImages.filter((asset) => {
			// Convert asset path to hash key: /img/user/attachments/image.png -> attachments/image.png
			const hashKey = asset.path.replace("/img/user/", "");
			const remoteHash = remoteImageHashes[hashKey];

			// Skip if unchanged (local hash matches remote hash)
			if (
				remoteHash &&
				asset.localHash &&
				remoteHash === asset.localHash
			) {
				logger.debug(`Skipping unchanged image: ${asset.path}`);

				return false;
			}

			return true;
		});

		const treeAssetPromises = imagesToUpload.map(async (asset) => {
			try {
				const blob = await this.octokit.request(
					"POST /repos/{owner}/{repo}/git/blobs",
					{
						...this.getBasePayload(),
						content: asset.content,
						encoding: "base64",
					},
				);

				return {
					path: `${IMAGE_PATH_BASE}${normalizePath(asset.path)}`,
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				logger.error(error);
			}
		});
		treePromises.push(...treeAssetPromises);

		const treeList = await Promise.all(treePromises);

		//Filter away undefined values
		const tree = treeList.filter((x) => x !== undefined) as {
			path?: string | undefined;
			mode?:
				| "100644"
				| "100755"
				| "040000"
				| "160000"
				| "120000"
				| undefined;
			type?: "tree" | "blob" | "commit" | undefined;
			sha?: string | null | undefined;
			content?: string | undefined;
		}[];

		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				base_tree: baseTreeSha,
				tree,
			},
		);

		const commitMessage = "Published multiple files";

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message: commitMessage,
				tree: newTree.data.sha,
				parents: [latestCommitSha],
			},
		);

		const defaultBranch = (await repoDataPromise).data.default_branch;

		await this.octokit.request(
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
			{
				...this.getBasePayload(),
				branch: defaultBranch,
				sha: newCommit.data.sha,
			},
		);
	}

	async getRepositoryInfo() {
		const repoInfo = await this.octokit
			.request("GET /repos/{owner}/{repo}", {
				...this.getBasePayload(),
			})
			.catch((error) => {
				logger.error(error);

				logger.warn(
					`Could not get repository info for ${this.getRepositoryName()}`,
				);

				return undefined;
			});

		return repoInfo?.data;
	}

	async createBranch(branchName: string, sha: string) {
		await this.octokit.request("POST /repos/{owner}/{repo}/git/refs", {
			...this.getBasePayload(),
			ref: `refs/heads/${branchName}`,
			sha,
		});
	}

	/**
	 * Trigger a GitHub Actions workflow
	 * @param workflowId - The workflow ID or filename (e.g., 'deploy.yml')
	 * @param branch - The branch to run the workflow on (default: 'main')
	 * @param inputs - Optional inputs to pass to the workflow
	 */
	async triggerWorkflow(
		workflowId: string,
		branch: string = "main",
		inputs?: Record<string, string>,
	): Promise<boolean> {
		try {
			const response = await this.octokit.request(
				"POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
				{
					...this.getBasePayload(),
					workflow_id: workflowId,
					ref: branch,
					inputs: inputs || {},
				},
			);

			if (response.status === 204) {
				logger.info(
					`Successfully triggered workflow ${workflowId} on ${branch}`,
				);

				return true;
			}

			return false;
		} catch (error) {
			logger.error(`Failed to trigger workflow ${workflowId}:`, error);

			return false;
		}
	}
}

export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
