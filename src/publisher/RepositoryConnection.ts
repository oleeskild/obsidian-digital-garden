import { Octokit } from "@octokit/core";

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

		this.octokit = new Octokit({ auth: githubToken });
	}

	getBasePayload() {
		return {
			owner: this.githubUserName,
			repo: this.gardenRepository,
		};
	}

	async getFile(path: string, branch?: string) {
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
			return;
		}
	}

	async deleteFile(path: string, branch?: string) {
		const sha = await this.getFile(path, branch).then((file) => file?.sha);
		if (!sha) {
			console.error(
				`Could not get sha for file ${path} from repository ${this.gardenRepository}`,
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

			return await this.octokit.request(
				"DELETE /repos/{owner}/{repo}/contents/{path}",
				payload,
			);
		} catch (error) {
			console.error(error);
		}
	}

	async getLatestRelease() {
		try {
			const release = await this.octokit.request(
				"GET /repos/{owner}/{repo}/releases/latest",
				this.getBasePayload(),
			);
			if (!release || !release.data) {
				console.error("Could not get latest release");
			}
			return release.data;
		} catch (error) {
			console.error("Could not get latest release", error);
		}
	}

	async getLatestCommit(): Promise<{ sha: string } | undefined> {
		try {
			const latestCommit = await this.octokit.request(
				"GET /repos/{owner}/{repo}/commits/HEAD",
				this.getBasePayload(),
			);

			if (!latestCommit || !latestCommit.data) {
				console.error("Could not get latest commit");
			}
			return latestCommit.data;
		} catch (error) {
			console.error("Could not get latest commit", error);
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
			console.error(error);
		}
	}
}
