import { Base64 } from "js-base64";
import {
	TemplateUpdateChecker,
	TemplateUpdater,
} from "../repositoryConnection/TemplateManager";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";
import { Octokit } from "@octokit/core";

const PLUGIN_INFO = {
	filesToAdd: ["src/site/new.njk"],
	filesToModify: ["package.json"],
	filesToDelete: ["old.js"],
};

const BASE_TREE = {
	tree: [
		{ path: "package.json", sha: "pkg-sha", type: "blob" },
		{ path: "src/site/new.njk", sha: "new-sha", type: "blob" },
	],
};

interface ITreeItem {
	path: string;
	sha: string;
	type: string;
}

const makeBaseConnection = (getFileCalls: string[] = []) =>
	({
		getFile: async (path: string) => {
			getFileCalls.push(path);

			if (path === "plugin-info.json") {
				return {
					content: Base64.encode(JSON.stringify(PLUGIN_INFO)),
				};
			}

			return { content: Base64.encode("template file content") };
		},
		getContent: async () => BASE_TREE,
		getRepositoryInfo: async () => ({ default_branch: "main" }),
	}) as unknown as RepositoryConnection;

const makeUserConnection = (contentBaseDir: string, tree: ITreeItem[]) =>
	({
		contentBaseDir,
		getContent: async () => ({ tree }),
	}) as unknown as RepositoryConnection;

describe("RepositoryConnection.contentBaseDir", () => {
	const octoKit = {} as Octokit;

	it("exposes the normalized base", () => {
		const connection = new RepositoryConnection({
			octoKit,
			userName: "user",
			pageName: "repo",
			contentBaseDir: "Web",
		});

		expect(connection.contentBaseDir).toBe("Web/");
	});

	it("is empty when unset", () => {
		const connection = new RepositoryConnection({
			octoKit,
			userName: "user",
			pageName: "repo",
		});

		expect(connection.contentBaseDir).toBe("");
	});
});

describe("TemplateUpdateChecker with a content base directory", () => {
	const upToDateTree = (base: string): ITreeItem[] => [
		{ path: `${base}package.json`, sha: "pkg-sha", type: "blob" },
		{ path: `${base}src/site/new.njk`, sha: "new-sha", type: "blob" },
	];

	it.each([
		{ label: "repo root", base: "" },
		{ label: "Web subfolder", base: "Web/" },
	])(
		"reports no updates when template files under the base match ($label)",
		async ({ base }) => {
			const checker = new TemplateUpdateChecker({
				baseGardenConnection: makeBaseConnection(),
				userGardenConnection: makeUserConnection(
					base,
					upToDateTree(base),
				),
			});

			expect(await checker.getFilesToUpdate()).toBeNull();
		},
	);

	it("diffs template files at the prefixed path, keeping template-relative paths", async () => {
		const userTree: ITreeItem[] = [
			// Outdated copy of a template file, plus a file slated for deletion.
			{ path: "Web/package.json", sha: "outdated-sha", type: "blob" },
			{ path: "Web/old.js", sha: "old-sha", type: "blob" },
			// A root-level file matching the template path must not count.
			{ path: "package.json", sha: "pkg-sha", type: "blob" },
		];

		const checker = new TemplateUpdateChecker({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: makeUserConnection("Web/", userTree),
		});

		const updateInfo = await checker.getFilesToUpdate();

		expect(updateInfo).toEqual({
			filesToDelete: [{ path: "old.js", sha: "old-sha" }],
			filesToUpdate: [{ path: "package.json", sha: "outdated-sha" }],
			filesToAdd: [{ path: "src/site/new.njk" }],
		});
	});
});

describe("TemplateUpdater with a content base directory", () => {
	it("reads from the template root but writes to the prefixed path", async () => {
		const baseGetFileCalls: string[] = [];
		const deletedPaths: string[] = [];
		const updatedPaths: string[] = [];

		const userGardenConnection = {
			contentBaseDir: "Web/",
			getLatestCommit: async () => ({ sha: "commit-sha" }),
			createBranch: async () => undefined,
			deleteFile: async (path: string) => {
				deletedPaths.push(path);

				return true;
			},
			updateFile: async ({ path }: { path: string }) => {
				updatedPaths.push(path);
			},
			getBasePayload: () => ({ owner: "user", repo: "repo" }),
			octokit: {
				request: async () => ({ data: { html_url: "pr-url" } }),
			},
		} as unknown as RepositoryConnection;

		const updater = new TemplateUpdater({
			baseGardenConnection: makeBaseConnection(baseGetFileCalls),
			userGardenConnection,
			defaultBranch: "main",
			newestTemplateVersion: "1.0.0",
			filesToChange: {
				filesToDelete: [{ path: "old.js", sha: "old-sha" }],
				filesToUpdate: [{ path: "package.json", sha: "outdated-sha" }],
				filesToAdd: [{ path: "src/site/new.njk" }],
			},
		});

		await updater.updateTemplate();

		expect(deletedPaths).toEqual(["Web/old.js"]);
		expect(updatedPaths).toContain("Web/package.json");
		expect(updatedPaths).toContain("Web/src/site/new.njk");
		// Content is always fetched from the base template repo at the template-relative path.
		expect(baseGetFileCalls).toContain("package.json");
		expect(baseGetFileCalls).toContain("src/site/new.njk");
		expect(baseGetFileCalls).not.toContain("Web/package.json");
	});
});
