import { forgejoApi, type ChangeFileOperation } from "@maks1ms/forgejo-js";
import { Base64 } from "js-base64";
import Logger from "js-logger";
import type { CompiledPublishFile } from "src/publishFile/PublishFile";
import { throwIfLimitError } from "../forestry/LimitReachedError";
import { normalizeRepoDirectory } from "../publisher/paths";
import type {
	IPutPayload,
	IRepositoryConnection,
	IRepositoryInfo,
} from "./RepositoryConnection";

const logger = Logger.get("forgejo-repository-connection");
const IMAGE_PATH_BASE = "src/site/";
const NOTE_PATH_BASE = "src/site/notes/";

type ForgejoApi = ReturnType<typeof forgejoApi>;

export interface IForgejoConnection {
	api: ForgejoApi;
	userName: string;
	pageName: string;
	notesDirectory?: string;
	assetsDirectory?: string;
}

export class ForgejoRepositoryConnection implements IRepositoryConnection {
	private readonly api: ForgejoApi;
	private readonly userName: string;
	private readonly pageName: string;
	private readonly noteBase: string;
	private readonly assetBase: string;

	constructor({
		api,
		userName,
		pageName,
		notesDirectory,
		assetsDirectory,
	}: IForgejoConnection) {
		this.api = api;
		this.userName = userName;
		this.pageName = pageName;

		this.noteBase =
			normalizeRepoDirectory(notesDirectory) || NOTE_PATH_BASE;

		this.assetBase =
			normalizeRepoDirectory(assetsDirectory) ||
			`${IMAGE_PATH_BASE}img/user/`;
	}

	getRepositoryName() {
		return `${this.userName}/${this.pageName}`;
	}

	async getContent(branch: string) {
		try {
			const response = await this.api.repos.getTree(
				this.userName,
				this.pageName,
				branch,
				{ recursive: true },
				{ cache: "no-store" },
			);

			return {
				sha: response.data.sha,
				url: response.data.url,
				truncated: response.data.truncated,
				tree: response.data.tree ?? [],
			};
		} catch (error) {
			logger.error(error);
			throw new Error(
				`Could not get content tree from repository ${this.getRepositoryName()}`,
			);
		}
	}

	async getFile(path: string, branch?: string) {
		try {
			const response = await this.api.repos.repoGetContents(
				this.userName,
				this.pageName,
				path,
				branch ? { ref: branch } : undefined,
				{ cache: "no-store" },
			);

			if (Array.isArray(response.data) || response.data.type !== "file") {
				return undefined;
			}

			return {
				...response.data,
				content: response.data.content ?? "",
				sha: response.data.sha ?? "",
				type: "file" as const,
			};
		} catch (error) {
			logger.error(error);
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

			if (!sha) return false;

			await this.api.repos.repoDeleteFile(
				this.userName,
				this.pageName,
				path,
				{
					branch,
					message: `Delete content ${path}`,
					sha,
				},
			);

			return true;
		} catch (error) {
			throwIfLimitError(error);
			logger.error(error);

			return false;
		}
	}

	async getLatestRelease() {
		try {
			return (
				await this.api.repos.repoGetLatestRelease(
					this.userName,
					this.pageName,
				)
			).data;
		} catch (error) {
			logger.error("Could not get latest release", error);
		}
	}

	async getLatestCommit() {
		try {
			const repository = await this.getRepositoryInfo();
			const defaultBranch = repository?.default_branch;

			if (!defaultBranch) return undefined;

			const commits = await this.api.repos.repoGetAllCommits(
				this.userName,
				this.pageName,
				{
					sha: defaultBranch,
					limit: 1,
					stat: false,
					verification: false,
					files: false,
				},
				{ cache: "no-store" },
			);
			const commit = commits.data[0];

			if (!commit?.sha) return undefined;

			const tree = await this.getContent(commit.sha);

			if (!tree?.sha) return undefined;

			return { sha: commit.sha, commit: { tree: { sha: tree.sha } } };
		} catch (error) {
			logger.error("Could not get latest commit", error);
		}
	}

	async updateFile({ path, sha, content, branch, message }: IPutPayload) {
		if (sha) {
			return this.api.repos.repoUpdateFile(
				this.userName,
				this.pageName,
				path,
				{ branch, content, message, sha },
			);
		}

		return this.api.repos.repoCreateFile(
			this.userName,
			this.pageName,
			path,
			{ branch, content, message },
		);
	}

	async deleteFiles(filePaths: string[]) {
		const tree = await this.getContent(
			(await this.getRepositoryInfo())?.default_branch ?? "main",
		);

		const hashes = new Map(
			(tree?.tree ?? []).map((entry) => [entry.path, entry.sha]),
		);

		const files: ChangeFileOperation[] = filePaths.map((path) => {
			const normalized = path.startsWith("/") ? path.slice(1) : path;

			const repositoryPath = path.endsWith(".md")
				? `${this.noteBase}${normalized}`
				: `${this.assetBase}${normalized}`;

			return {
				operation: "delete",
				path: repositoryPath,
				sha: hashes.get(repositoryPath),
			};
		});

		await this.api.repos.repoChangeFiles(this.userName, this.pageName, {
			files,
			message: "Deleted multiple files",
		});
	}

	async updateFiles(
		compiledFiles: CompiledPublishFile[],
		remoteImageHashes: Record<string, string> = {},
		onProgress?: (completed: number, currentPath: string) => void,
	) {
		const repository = await this.getRepositoryInfo();
		const branch = repository?.default_branch;

		if (!branch)
			throw new Error("Could not determine repository default branch");

		const tree = await this.getContent(branch);

		const hashes = new Map(
			(tree?.tree ?? []).map((entry) => [entry.path, entry.sha]),
		);
		const operations: ChangeFileOperation[] = [];

		let completed = 0;

		for (const file of compiledFiles) {
			const [text, assets] = file.compiledFile;

			const notePath = `${this.noteBase}${file
				.getPath()
				.replace(/^\//, "")}`;
			const noteSha = hashes.get(notePath);

			operations.push({
				operation: noteSha ? "update" : "create",
				path: notePath,
				sha: noteSha,
				content: Base64.encode(text),
			});

			for (const asset of assets.images) {
				const hashKey = asset.path.replace("/img/user/", "");

				if (
					remoteImageHashes[hashKey] &&
					asset.localHash === remoteImageHashes[hashKey]
				) {
					continue;
				}

				const imagePath = `${this.assetBase}${asset.path.replace(
					/^\/?img\/user\//,
					"",
				)}`;
				const imageSha = hashes.get(imagePath);

				operations.push({
					operation: imageSha ? "update" : "create",
					path: imagePath,
					sha: imageSha,
					content: asset.content,
				});
			}

			completed++;
			onProgress?.(completed, file.getPath());
		}

		if (operations.length === 0) return;

		await this.api.repos.repoChangeFiles(this.userName, this.pageName, {
			branch,
			files: operations,
			message: "Published multiple files",
		});
	}

	async getRepositoryInfo(): Promise<IRepositoryInfo | undefined> {
		try {
			return (
				await this.api.repos.repoGet(this.userName, this.pageName, {
					cache: "no-store",
				})
			).data;
		} catch (error) {
			logger.error(error);
		}
	}

	async createBranch(branchName: string, sha: string) {
		await this.api.repos.repoCreateBranch(this.userName, this.pageName, {
			new_branch_name: branchName,
			old_ref_name: sha,
		});
	}

	async createPullRequest({
		title,
		head,
		base,
		body,
	}: {
		title: string;
		head: string;
		base: string;
		body: string;
	}) {
		const response = await this.api.repos.repoCreatePullRequest(
			this.userName,
			this.pageName,
			{ title, head, base, body },
		);

		return response.data.html_url ?? "";
	}
}

export function createForgejoApi(baseUrl: string, token: string) {
	const serverUrl = baseUrl
		.trim()
		.replace(/\/+$/, "")
		.replace(/\/api\/v1$/, "");

	return forgejoApi(serverUrl, { token });
}
