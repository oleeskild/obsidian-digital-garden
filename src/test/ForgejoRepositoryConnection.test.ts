import { ForgejoRepositoryConnection } from "../repositoryConnection/ForgejoRepositoryConnection";

const makeConnection = (repos: Record<string, jest.Mock>) =>
	new ForgejoRepositoryConnection({
		api: { repos } as never,
		userName: "owner",
		pageName: "garden",
	});

describe("ForgejoRepositoryConnection", () => {
	it("uses Forgejo's generated tree endpoint and normalizes its response", async () => {
		const getTree = jest.fn().mockResolvedValue({
			data: {
				sha: "tree-sha",
				tree: undefined,
				truncated: false,
			},
		});
		const connection = makeConnection({ getTree });

		await expect(connection.getContent("main")).resolves.toEqual({
			sha: "tree-sha",
			url: undefined,
			truncated: false,
			tree: [],
		});

		expect(getTree).toHaveBeenCalledWith(
			"owner",
			"garden",
			"main",
			{ recursive: true },
			{ cache: "no-store" },
		);
	});

	it("uses Forgejo create and update file operations", async () => {
		const repoCreateFile = jest.fn().mockResolvedValue({ data: {} });
		const repoUpdateFile = jest.fn().mockResolvedValue({ data: {} });
		const connection = makeConnection({ repoCreateFile, repoUpdateFile });

		await connection.updateFile({
			path: "new.md",
			content: "base64",
			message: "Create",
		});

		await connection.updateFile({
			path: "existing.md",
			content: "base64",
			message: "Update",
			sha: "file-sha",
		});

		expect(repoCreateFile).toHaveBeenCalledWith(
			"owner",
			"garden",
			"new.md",
			{ branch: undefined, content: "base64", message: "Create" },
		);

		expect(repoUpdateFile).toHaveBeenCalledWith(
			"owner",
			"garden",
			"existing.md",
			{
				branch: undefined,
				content: "base64",
				message: "Update",
				sha: "file-sha",
			},
		);
	});

	it("gets the latest commit from the native Forgejo commit list", async () => {
		const repoGet = jest.fn().mockResolvedValue({
			data: { default_branch: "main" },
		});

		const repoGetAllCommits = jest.fn().mockResolvedValue({
			data: [{ sha: "commit-sha" }],
		});

		const getTree = jest.fn().mockResolvedValue({
			data: { sha: "tree-sha", tree: [] },
		});

		const connection = makeConnection({
			repoGet,
			repoGetAllCommits,
			getTree,
		});

		await expect(connection.getLatestCommit()).resolves.toEqual({
			sha: "commit-sha",
			commit: { tree: { sha: "tree-sha" } },
		});

		expect(repoGetAllCommits).toHaveBeenCalledWith(
			"owner",
			"garden",
			{
				sha: "main",
				limit: 1,
				stat: false,
				verification: false,
				files: false,
			},
			{ cache: "no-store" },
		);
	});
});
