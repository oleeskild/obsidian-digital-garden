import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { CompiledPublishFile } from "src/publishFile/PublishFile";

const logger = Logger.get("repository-connection");
const oktokitLogger = Logger.get("octokit");

interface IOctokitterInput {
	githubToken: string;
	githubUserName: string;
	quartzRepository: string;
	contentFolder: string;
	vaultPath: string;
}

interface IPutPayload {
	path: string;
	sha?: string;
	content: string;
	branch?: string;
	message?: string;
}

export class RepositoryConnection {
	private githubUserName: string;
	private quartzRepository: string;
	octokit: Octokit;
	contentFolder: string;
	vaultPath: string;

	constructor({
		quartzRepository,
		githubToken,
		githubUserName,
		contentFolder,
		vaultPath,
	}: IOctokitterInput) {
		this.quartzRepository = quartzRepository;
		this.githubUserName = githubUserName;

		this.octokit = new Octokit({ auth: githubToken, log: oktokitLogger });

		this.contentFolder = contentFolder;
		this.vaultPath = vaultPath;
	}

	getRepositoryName() {
		return this.githubUserName + "/" + this.quartzRepository;
	}

	getBasePayload() {
		return {
			owner: this.githubUserName,
			repo: this.quartzRepository,
		};
	}

	getRepositoryPath(path: string) {
		const repositoryPath = path.startsWith(this.contentFolder)
			? path.replace(this.contentFolder, "")
			: path;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	getVaultPath(path: string) {
		const vaultPath = path.startsWith(this.vaultPath)
			? path.replace(this.vaultPath, "")
			: path;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	setRepositoryPath(path: string) {
		const separator = path.startsWith("/") ? "" : "/";

		const repositoryPath = path.startsWith(this.contentFolder)
			? path
			: `${this.contentFolder}${separator}${path}`;

		return repositoryPath.startsWith("/")
			? repositoryPath.slice(1)
			: repositoryPath;
	}

	setVaultPath(path: string) {
		const separator = path.startsWith("/") ? "" : "/";

		const vaultPath = path.startsWith(this.vaultPath)
			? path
			: `${this.vaultPath}${separator}${path}`;

		return vaultPath.startsWith("/") ? vaultPath.slice(1) : vaultPath;
	}

	repositoryToVaultPath(path: string) {
		return this.setVaultPath(this.getRepositoryPath(path));
	}

	repositoryToRepositoryPath(path: string) {
		return this.setRepositoryPath(this.getVaultPath(path));
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
		path = this.setRepositoryPath(
			this.getVaultPath(this.getRepositoryPath(path)),
		);

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
		path = this.setRepositoryPath(
			this.getVaultPath(this.getRepositoryPath(path)),
		);

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
		path = this.setRepositoryPath(
			this.getVaultPath(this.getRepositoryPath(path)),
		);

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

	async deleteFiles(filePaths: string[]) {
		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			logger.error("Could not get latest commit");

			return;
		}

		const normalizePath = (path: string) => {
			let previous;

			do {
				previous = path;
				path = path.replace(/\.\.\//g, "");
			} while (path !== previous);

			path = this.getVaultPath(path);

			return path.startsWith("/")
				? `${this.contentFolder}${path}`
				: `${this.contentFolder}/${path}`;
		};

		const filesToDelete = filePaths.map((path) => {
			return normalizePath(path);
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
			.filter((item: { path: string }) =>
				filesToDelete.includes(item.path),
			) // Mark sha of files to be deleted as null
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
					sha: null,
				}),
			);

		//eslint-disable-next-line
		const tree = newTreeEntries.filter((x: any) => x !== undefined) as {
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
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
			{
				...this.getBasePayload(),
				branch: defaultBranch,
				sha: newCommit.data.sha,
			},
		);
	}

	async updateFiles(files: CompiledPublishFile[]) {
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

		const normalizePath = (path: string) => {
			let previous;

			do {
				previous = path;
				path = path.replace(/\.\.\//g, "");
			} while (path !== previous);

			path = this.getVaultPath(path);

			return path.startsWith("/")
				? `${this.contentFolder}${path}`
				: `${this.contentFolder}/${path}`;
		};

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

				return {
					path: normalizePath(file.getPath()),
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				logger.error(error);
			}
		});

		const treeAssetPromises = files
			.flatMap((x) => x.compiledFile[1].blobs)
			.map(async (asset) => {
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
						path: normalizePath(asset.path),
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
}

export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
