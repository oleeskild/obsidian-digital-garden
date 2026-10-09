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
			getWriteBranch: async () => "main",
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

/**
 * Fake garden repo whose default branch is `master` (the template repo's is
 * `main`) and which may have a publish branch `drafts`.
 */
const makeGardenOctokit = (branches: string[]) => {
	const requests: { route: string; payload: Record<string, unknown> }[] = [];

	const request = async (route: string, payload: Record<string, unknown>) => {
		requests.push({ route, payload });

		if (route === "GET /repos/{owner}/{repo}") {
			return { data: { default_branch: "master" } };
		}

		if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}") {
			if (!branches.includes(String(payload.ref).slice(6))) {
				throw Object.assign(new Error("Not Found"), { status: 404 });
			}

			return { data: {} };
		}

		if (route.startsWith("GET /repos/{owner}/{repo}/git/trees/")) {
			return { status: 200, data: { tree: [] } };
		}

		if (route.startsWith("GET /repos/{owner}/{repo}/commits/{ref}")) {
			return { data: { sha: `${payload.ref}-tip` } };
		}

		if (route === "POST /repos/{owner}/{repo}/pulls") {
			return { data: { html_url: "pr-url" } };
		}

		return { data: {} };
	};

	return { request, requests };
};

const makeGardenConnection = (
	octokit: ReturnType<typeof makeGardenOctokit>,
	branch?: string,
) =>
	new RepositoryConnection({
		octoKit: octokit as unknown as Octokit,
		userName: "user",
		pageName: "garden",
		branch,
	});

const route = (octokit: ReturnType<typeof makeGardenOctokit>, prefix: string) =>
	octokit.requests.filter((r) => r.route.startsWith(prefix));

describe("Template updates target the garden's own branch", () => {
	const runUpdate = async (
		octokit: ReturnType<typeof makeGardenOctokit>,
		branch?: string,
	) => {
		const checker = new TemplateUpdateChecker({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: makeGardenConnection(octokit, branch),
		});

		await checker.getFilesToUpdate();

		await new TemplateUpdater({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: makeGardenConnection(octokit, branch),
			newestTemplateVersion: "1.0.0",
			filesToChange: {
				filesToDelete: [],
				filesToUpdate: [],
				filesToAdd: [{ path: "src/site/new.njk" }],
			},
		}).updateTemplate();
	};

	it("uses the garden's default branch, not the template repo's", async () => {
		const octokit = makeGardenOctokit([]);

		await runUpdate(octokit);

		// The comparison reads the garden's HEAD rather than a branch name
		// borrowed from the template repo.
		const [treeRead] = route(
			octokit,
			"GET /repos/{owner}/{repo}/git/trees/",
		);
		expect(treeRead.payload.tree_sha).toBe("HEAD");

		const [newRef] = route(octokit, "POST /repos/{owner}/{repo}/git/refs");
		expect(newRef.payload.sha).toBe("master-tip");

		const [pr] = route(octokit, "POST /repos/{owner}/{repo}/pulls");
		expect(pr.payload.base).toBe("master");
	});

	it("compares against, branches from and targets the publish branch", async () => {
		const octokit = makeGardenOctokit(["drafts"]);

		await runUpdate(octokit, "drafts");

		const [treeRead] = route(
			octokit,
			"GET /repos/{owner}/{repo}/git/trees/",
		);
		expect(treeRead.payload.tree_sha).toBe("drafts");

		const [newRef] = route(octokit, "POST /repos/{owner}/{repo}/git/refs");
		expect(newRef.payload.sha).toBe("drafts-tip");

		const [pr] = route(octokit, "POST /repos/{owner}/{repo}/pulls");
		expect(pr.payload.base).toBe("drafts");
	});

	it("fails before creating a branch when the publish branch is missing", async () => {
		const octokit = makeGardenOctokit([]);

		await expect(runUpdate(octokit, "drafts")).rejects.toThrow(
			'The publish branch "drafts" does not exist',
		);

		expect(
			octokit.requests.filter((r) => !r.route.startsWith("GET ")),
		).toHaveLength(0);
	});
});
