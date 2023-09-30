import { Octokit } from "@octokit/core";
import Logger from "js-logger";

const logger = Logger.get("repository-connection");
const oktokitLogger = Logger.get("octokit");

interface IOctokitterInput {
	githubToken: string;
	githubUserName: string;
	gardenRepository: string;
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
	private gardenRepository: string;
	private octokit: Octokit;

	constructor({
		gardenRepository,
		githubToken,
		githubUserName,
	}: IOctokitterInput) {
		this.gardenRepository = gardenRepository;
		this.githubUserName = githubUserName;

		this.octokit = new Octokit({ auth: githubToken, log: oktokitLogger });
	}

	getBasePayload() {
		return {
			owner: this.githubUserName,
			repo: this.gardenRepository,
		};
	}

	/** Get filetree with path and sha of each file from repository */
	async getContent(branch: string) {
		try {
			const response = await this.octokit.request(
				"GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
				{
					...this.getBasePayload(),
					tree_sha: branch,
					recursive: "true",
				},
			);

			if (response.status === 200) {
				return response.data;
			}
		} catch (error) {
			throw new Error(
				`Could not get repository content  ${this.githubUserName}/${this.gardenRepository}`,
			);
		}
	}

	async getFile(path: string, branch?: string) {
		logger.info(
			`Getting file ${path} from repository ${this.githubUserName}/${this.gardenRepository}`,
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
				`Could not get file ${path} from repository ${this.githubUserName}/${this.gardenRepository}`,
			);
		}
	}

	async deleteFile(
		path: string,
		{ branch, sha }: { branch?: string; sha?: string },
	) {
		if (!sha) {
			sha ??= await this.getFile(path, branch).then((file) => file?.sha);

			logger.error(
				`Could not get sha for file ${path} from repository ${this.githubUserName}/${this.gardenRepository}`,
			);

			return;
		}

		try {
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
				`Deleted file ${path} from repository ${this.githubUserName}/${this.gardenRepository}`,
			);

			return result;
		} catch (error) {
			logger.error(error);
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

	async getLatestCommit(): Promise<{ sha: string } | undefined> {
		try {
			const latestCommit = await this.octokit.request(
				"GET /repos/{owner}/{repo}/commits/HEAD",
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
}

export type TRepositoryContent = Awaited<
	ReturnType<typeof RepositoryConnection.prototype.getContent>
>;
