import { Octokit } from "@octokit/core";

interface IOctokitterInput {
	githubToken: string;
	githubUserName: string;
	gardenRepository: string;
}

export class Octokitter {
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

	async getFileSha(path: string) {
		try {
			const response = await this.octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					...this.getBasePayload(),
					path,
				},
			);

			if (response.status === 200 && !Array.isArray(response.data)) {
				return response.data.sha;
			}
		} catch (error) {
			console.log(error);
		}
		throw new Error(`Could not get sha for ${path}`);
	}

	async deleteFile(path: string) {
		const sha = await this.getFileSha(path);
		const payload = {
			...this.getBasePayload(),
			path,
			message: `Delete content ${path}`,
			sha,
		};

		return await this.octokit.request(
			"DELETE /repos/{owner}/{repo}/contents/{path}",
			payload,
		);
	}
}
