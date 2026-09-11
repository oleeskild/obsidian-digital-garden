import { Octokit } from "@octokit/core";
import Logger from "js-logger";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { IPublishPlatformConnection } from "src/models/IPublishPlatformConnection";
import { throwIfLimitError } from "src/forestry/LimitReachedError";
import { normalizeContentBaseDir } from "src/publisher/paths";

const logger = Logger.get("repository-connection");

const IMAGE_PATH_BASE = "src/site/";
const NOTE_PATH_BASE = "src/site/notes/";

/**
 * Upper bound on changed files per commit in a batch publish. GitHub's
 * create-tree endpoint returns HTTP 422 "your request timed out" when a
 * single tree request carries too many entries (seen with ~600 notes), so
 * larger publishes are split into consecutive commits of this size.
 */
export const MAX_TREE_ENTRIES_PER_COMMIT = 100;

interface ITreeEntry {
	path: string;
	mode: "100644";
	type: "blob";
	/** `null` removes the path from the tree. */
	sha: string | null;
}

/** Commit/tree shas the next chunked commit builds on; advanced per commit. */
interface ICommitChainState {
	parentCommitSha: string;
	baseTreeSha: string;
	defaultBranch: string;
}

/** `" (2/5)"` for multi-commit batches, `""` for a single commit. */
const chunkLabel = (index: number, count: number) =>
	count > 1 ? ` (${index + 1}/${count})` : "";

const chunk = <T>(items: T[], size: number): T[][] => {
	const result: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		result.push(items.slice(i, i + size));
	}

	return result;
};

interface IPutPayload {
	path: string;
	sha?: string;
	content: string;
	branch?: string;
	message?: string;
}

/**
 * Progress reporting for a batch publish: `done`/`total` count upload
 * operations plus a final commit step, `message` names what just happened.
 */
export type PublishProgressCallback = (
	done: number,
	total: number,
	message: string,
) => void;

export class RepositoryConnection {
	private userName: string;
	private pageName: string;
	private contentBase: string;
	octokit: Octokit;

	constructor({
		octoKit,
		userName,
		pageName,
		contentBaseDir,
	}: IPublishPlatformConnection) {
		this.pageName = pageName;
		this.userName = userName;
		this.contentBase = normalizeContentBaseDir(contentBaseDir);
		this.octokit = octoKit;
	}

	/** Normalized content base prefix (`""` or e.g. `"Web/"`) this connection publishes under. */
	get contentBaseDir(): string {
		return this.contentBase;
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
			// The cacheBust param defeats Electron's HTTP cache (GitHub serves
			// max-age=60): a stale response here means a stale file sha, which
			// makes the next updateFile fail as an edit conflict.
			const response = await this.octokit.request(
				`GET /repos/{owner}/{repo}/contents/{path}?cacheBust=${Date.now()}`,
				{
					...this.getBasePayload(),
					path,
					ref: branch,
					headers: {
						"If-None-Match": "",
					},
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

	/**
	 * Get a blob's base64 content by sha (from a tree listing). Unlike the
	 * contents API, this works for files larger than 1 MB.
	 */
	async getBlob(fileSha: string): Promise<string | undefined> {
		try {
			const response = await this.octokit.request(
				"GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
				{
					...this.getBasePayload(),
					file_sha: fileSha,
				},
			);

			if (response.status === 200) {
				return response.data.content;
			}
		} catch (error) {
			logger.error(error);
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
			throwIfLimitError(error);
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
			throwIfLimitError(error);
			logger.error(error);
		}
	}

	/**
	 * Delete the given full repo paths from the default branch. Like
	 * {@link updateFiles}, large deletions are split into consecutive commits
	 * of at most {@link MAX_TREE_ENTRIES_PER_COMMIT} entries so GitHub's
	 * create-tree endpoint does not time out, and the branch is advanced after
	 * every commit so partial progress is kept. Throws on failure.
	 */
	async deleteFiles(
		repoPaths: string[],
		onProgress?: PublishProgressCallback,
	) {
		if (repoPaths.length === 0) {
			return;
		}

		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			throw new Error("Could not get latest commit");
		}

		const repoData = await this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const state: ICommitChainState = {
			parentCommitSha: latestCommit.sha,
			baseTreeSha: latestCommit.commit.tree.sha,
			defaultBranch: repoData.data.default_branch,
		};

		const chunks = chunk(repoPaths, MAX_TREE_ENTRIES_PER_COMMIT);
		const totalSteps = repoPaths.length + chunks.length;
		let stepsDone = 0;

		onProgress?.(0, totalSteps, "Deleting files…");

		for (const [index, pathChunk] of chunks.entries()) {
			const commitLabel = chunkLabel(index, chunks.length);

			onProgress?.(
				stepsDone,
				totalSteps,
				`Deleting ${pathChunk.length} files${commitLabel}…`,
			);

			await this.commitTreeEntries(
				pathChunk.map((path) => ({
					path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: null,
				})),
				`Deleted multiple files${commitLabel}`,
				state,
			);

			stepsDone += pathChunk.length + 1;

			onProgress?.(
				stepsDone,
				totalSteps,
				`Deleted ${pathChunk.length} files`,
			);
		}

		onProgress?.(totalSteps, totalSteps, "Deleted");
	}

	/**
	 * Create a tree on top of `state.baseTreeSha` with the given entries,
	 * commit it on top of `state.parentCommitSha`, advance the default branch
	 * to it, and update `state` so the next call chains onto this commit.
	 */
	private async commitTreeEntries(
		tree: ITreeEntry[],
		message: string,
		state: ICommitChainState,
	) {
		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				base_tree: state.baseTreeSha,
				tree,
			},
		);

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message,
				tree: newTree.data.sha,
				parents: [state.parentCommitSha],
			},
		);

		await this.octokit.request(
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
			{
				...this.getBasePayload(),
				branch: state.defaultBranch,
				sha: newCommit.data.sha,
			},
		);

		state.parentCommitSha = newCommit.data.sha;
		state.baseTreeSha = newTree.data.sha;
	}

	async updateFiles(
		files: CompiledPublishFile[],
		remoteImageHashes: Record<string, string> = {},
		onProgress?: PublishProgressCallback,
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

		const normalizePath = (path: string) =>
			path.startsWith("/") ? path.slice(1) : path;

		// One upload job per note and per changed image. Each uploads a blob
		// and resolves to its tree entry (or undefined when the upload failed
		// and was logged).
		const uploadNote = async (
			file: CompiledPublishFile,
		): Promise<ITreeEntry | undefined> => {
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
					path: `${this.contentBase}${NOTE_PATH_BASE}${normalizePath(
						file.getPath(),
					)}`,
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				throwIfLimitError(error);
				logger.error(error);
			}
		};

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

		const uploadImage = async (
			asset: (typeof imagesToUpload)[number],
		): Promise<ITreeEntry | undefined> => {
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
					path: `${this.contentBase}${IMAGE_PATH_BASE}${normalizePath(
						asset.path,
					)}`,
					mode: "100644",
					type: "blob",
					sha: blob.data.sha,
				};
			} catch (error) {
				throwIfLimitError(error);
				logger.error(error);
			}
		};

		const jobs: {
			path: string;
			run: () => Promise<ITreeEntry | undefined>;
		}[] = [
			...files.map((file) => ({
				path: file.getPath(),
				run: () => uploadNote(file),
			})),
			...imagesToUpload.map((asset) => ({
				path: asset.path,
				run: () => uploadImage(asset),
			})),
		];

		// GitHub's create-tree endpoint times out on very large trees ("Sorry,
		// your request timed out. It's likely that your input was too large to
		// process"), so a big publish is split into several commits, each
		// holding at most MAX_TREE_ENTRIES_PER_COMMIT changed files. Every
		// commit builds on the previous one and the branch ref is advanced
		// after each, so a failure part-way through keeps what was already
		// published. Chunking also bounds how many blob uploads run at once.
		const chunks = chunk(jobs, MAX_TREE_ENTRIES_PER_COMMIT);

		// Upload progress: one unit per blob upload plus one per commit.
		const totalSteps = jobs.length + chunks.length;
		let stepsDone = 0;

		onProgress?.(0, totalSteps, "Uploading files…");

		const state: ICommitChainState = {
			parentCommitSha: latestCommit.sha,
			baseTreeSha: latestCommit.commit.tree.sha,
			defaultBranch: (await repoDataPromise).data.default_branch,
		};

		for (const [index, jobChunk] of chunks.entries()) {
			const treeList = await Promise.all(
				jobChunk.map(async (job) => {
					const entry = await job.run();
					stepsDone += 1;
					onProgress?.(stepsDone, totalSteps, `Uploaded ${job.path}`);

					return entry;
				}),
			);

			//Filter away undefined values
			const tree = treeList.filter(
				(x): x is ITreeEntry => x !== undefined,
			);

			const commitLabel = chunkLabel(index, chunks.length);

			onProgress?.(
				stepsDone,
				totalSteps,
				`Creating commit${commitLabel}…`,
			);

			if (tree.length > 0) {
				await this.commitTreeEntries(
					tree,
					`Published multiple files${commitLabel}`,
					state,
				);
			}

			stepsDone += 1;
		}

		onProgress?.(totalSteps, totalSteps, "Published");
	}

	/**
	 * Commit a set of raw file additions/updates and deletions as one atomic
	 * commit on the default branch (blobs → tree → commit → ref, the same
	 * flow as {@link updateFiles}). Used by the garden plugin installer so an
	 * install, update, or uninstall is always a single commit. Paths are full
	 * repo paths; addition content is base64. Throws on failure — callers
	 * surface the error to the user.
	 */
	async commitChanges({
		additions = [],
		deletions = [],
		message,
	}: {
		additions?: { path: string; content: string }[];
		deletions?: string[];
		message: string;
	}) {
		if (additions.length === 0 && deletions.length === 0) {
			return;
		}

		const latestCommit = await this.getLatestCommit();

		if (!latestCommit) {
			throw new Error("Could not get latest commit");
		}

		const repoDataPromise = this.octokit.request(
			"GET /repos/{owner}/{repo}",
			{
				...this.getBasePayload(),
			},
		);

		const additionEntries = await Promise.all(
			additions.map(async (file) => {
				const blob = await this.octokit.request(
					"POST /repos/{owner}/{repo}/git/blobs",
					{
						...this.getBasePayload(),
						content: file.content,
						encoding: "base64",
					},
				);

				return {
					path: file.path,
					mode: "100644" as const,
					type: "blob" as const,
					sha: blob.data.sha,
				};
			}),
		);

		const deletionEntries = deletions.map((path) => ({
			path,
			mode: "100644" as const,
			type: "blob" as const,
			sha: null,
		}));

		const newTree = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/trees",
			{
				...this.getBasePayload(),
				base_tree: latestCommit.commit.tree.sha,
				tree: [...additionEntries, ...deletionEntries],
			},
		);

		const newCommit = await this.octokit.request(
			"POST /repos/{owner}/{repo}/git/commits",
			{
				...this.getBasePayload(),
				message,
				tree: newTree.data.sha,
				parents: [latestCommit.sha],
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
