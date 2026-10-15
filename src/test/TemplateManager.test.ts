import { Base64 } from "js-base64";
import {
	canApplyTemplate,
	compareTemplateVersions,
	hasUpdates,
	TEMPLATE_VERSION_FILE,
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
		getLatestRelease: async () => ({ tag_name: "1.93.0" }),
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

		const commits: {
			additions: { path: string; content: string }[];
			deletions: string[];
		}[] = [];

		const userGardenConnection = {
			contentBaseDir: "Web/",
			getWriteBranch: async () => "main",
			getLatestCommit: async () => ({
				sha: "commit-sha",
				commit: { tree: { sha: "tree-sha" } },
			}),
			createCommit: async (commit: (typeof commits)[number]) => {
				commits.push(commit);

				return "new-commit-sha";
			},
			createBranch: async () => undefined,
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

		expect(commits).toHaveLength(1);
		expect(commits[0].deletions).toEqual(["Web/old.js"]);

		expect(commits[0].additions.map((a) => a.path)).toEqual([
			"Web/package.json",
			"Web/src/site/new.njk",
			`Web/${TEMPLATE_VERSION_FILE}`,
		]);
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
			return {
				data: {
					sha: `${payload.ref}-tip`,
					commit: { tree: { sha: `${payload.ref}-tree` } },
				},
			};
		}

		if (route === "POST /repos/{owner}/{repo}/git/blobs") {
			return { data: { sha: "blob-sha" } };
		}

		if (route === "POST /repos/{owner}/{repo}/git/trees") {
			return { data: { sha: "new-tree-sha" } };
		}

		if (route === "POST /repos/{owner}/{repo}/git/commits") {
			return { data: { sha: "new-commit-sha" } };
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
		baseGardenConnection = makeBaseConnection(),
	) => {
		const checker = new TemplateUpdateChecker({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: makeGardenConnection(octokit, branch),
		});

		await checker.getFilesToUpdate();

		await new TemplateUpdater({
			baseGardenConnection,
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

		const [commit] = route(
			octokit,
			"POST /repos/{owner}/{repo}/git/commits",
		);
		expect(commit.payload.parents).toEqual(["master-tip"]);

		const [tree] = route(octokit, "POST /repos/{owner}/{repo}/git/trees");
		expect(tree.payload.base_tree).toBe("master-tree");

		const [newRef] = route(octokit, "POST /repos/{owner}/{repo}/git/refs");
		expect(newRef.payload.sha).toBe("new-commit-sha");

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

		const [commit] = route(
			octokit,
			"POST /repos/{owner}/{repo}/git/commits",
		);
		expect(commit.payload.parents).toEqual(["drafts-tip"]);

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

	it("applies the whole update as a single commit", async () => {
		const octokit = makeGardenOctokit([]);

		await runUpdate(octokit);

		expect(
			route(octokit, "POST /repos/{owner}/{repo}/git/commits"),
		).toHaveLength(1);
		// No per-file Contents API commits.
		expect(route(octokit, "PUT ")).toHaveLength(0);
		expect(route(octokit, "DELETE ")).toHaveLength(0);

		// The branch is only created once the commit exists, and never moved.
		expect(
			route(octokit, "POST /repos/{owner}/{repo}/git/refs"),
		).toHaveLength(1);
		expect(route(octokit, "PATCH ")).toHaveLength(0);
	});

	it("writes nothing when a template file cannot be fetched", async () => {
		const octokit = makeGardenOctokit([]);

		const failingBase = {
			getFile: async () => {
				throw new Error("API rate limit exceeded");
			},
		} as unknown as RepositoryConnection;

		await expect(
			runUpdate(octokit, undefined, failingBase),
		).rejects.toThrow("API rate limit exceeded");

		expect(
			octokit.requests.filter((r) => !r.route.startsWith("GET ")),
		).toHaveLength(0);
	});
});

describe("compareTemplateVersions", () => {
	it.each([
		["1.93.0", "1.92.1", 1],
		["1.92.1", "1.93.0", -1],
		["1.93.0", "1.93.0", 0],
		["v1.93.0", "1.93.0", 0],
		["1.10.0", "1.9.0", 1],
		["1.93", "1.93.0", 0],
		["next", "1.93.0", 1],
		["next", "next", 0],
	])("%s vs %s", (a, b, sign) => {
		expect(Math.sign(compareTemplateVersions(a, b))).toBe(sign);
	});
});

describe("Template version file", () => {
	const upToDateFiles: ITreeItem[] = [
		{ path: "package.json", sha: "pkg-sha", type: "blob" },
		{ path: "src/site/new.njk", sha: "new-sha", type: "blob" },
	];

	const customizedFiles: ITreeItem[] = [
		{ path: "package.json", sha: "customized-sha", type: "blob" },
		{ path: "src/site/new.njk", sha: "new-sha", type: "blob" },
	];

	const check = async (files: ITreeItem[], installedVersion?: string) => {
		const tree = installedVersion
			? [
					...files,
					{
						path: TEMPLATE_VERSION_FILE,
						sha: "version-sha",
						type: "blob",
					},
			  ]
			: files;

		const userGardenConnection = {
			contentBaseDir: "",
			getContent: async () => ({ tree }),
			getBlob: async (sha: string) =>
				sha === "version-sha"
					? Base64.encode(`${installedVersion}\n`)
					: undefined,
		} as unknown as RepositoryConnection;

		return new TemplateUpdateChecker({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection,
		}).checkForUpdates();
	};

	it("treats customized files on the latest version as up to date", async () => {
		const updater = await check(customizedFiles, "1.93.0");

		expect(hasUpdates(updater)).toBe(false);
		// ...but they can still be re-applied.
		expect(canApplyTemplate(updater)).toBe(true);
		expect((updater as TemplateUpdater).changedFileCount).toBe(1);
		expect(updater.installedVersion).toBe("1.93.0");
	});

	it("reports an update for a newer release even when files match", async () => {
		const updater = await check(upToDateFiles, "1.92.1");

		expect(hasUpdates(updater)).toBe(true);
		expect((updater as TemplateUpdater).changedFileCount).toBe(0);
	});

	it("has nothing to apply on the latest version with matching files", async () => {
		const updater = await check(upToDateFiles, "1.93.0");

		expect(hasUpdates(updater)).toBe(false);
		expect(canApplyTemplate(updater)).toBe(false);
	});

	it.each([
		{ files: customizedFiles, expected: true },
		{ files: upToDateFiles, expected: false },
	])(
		"falls back to comparing files when the garden has no version file",
		async ({ files, expected }) => {
			const updater = await check(files);

			expect(hasUpdates(updater)).toBe(expected);
			expect(updater.installedVersion).toBeUndefined();
		},
	);

	const makeCommitRecorder = () => {
		const commits: {
			additions: { path: string; content: string }[];
			deletions?: string[];
			message: string;
		}[] = [];
		const prs: { title: string }[] = [];

		const connection = {
			contentBaseDir: "Web/",
			getWriteBranch: async () => "main",
			getLatestCommit: async () => ({
				sha: "commit-sha",
				commit: { tree: { sha: "tree-sha" } },
			}),
			createCommit: async (commit: (typeof commits)[number]) => {
				commits.push(commit);

				return "new-commit-sha";
			},
			commitChanges: async (commit: (typeof commits)[number]) => {
				commits.push(commit);
			},
			createBranch: async () => undefined,
			getBasePayload: () => ({ owner: "user", repo: "repo" }),
			octokit: {
				request: async (_route: string, payload: { title: string }) => {
					prs.push(payload);

					return { data: { html_url: "pr-url" } };
				},
			},
		} as unknown as RepositoryConnection;

		return { connection, commits, prs };
	};

	const makeUpdater = (
		connection: RepositoryConnection,
		updateAvailable: boolean,
	) =>
		new TemplateUpdater({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: connection,
			newestTemplateVersion: "1.93.0",
			updateAvailable,
			filesToChange: {
				filesToDelete: [],
				filesToUpdate: [
					{ path: "package.json", sha: "customized-sha" },
				],
				filesToAdd: [],
			},
		});

	it("writes the version file in the same commit as the update", async () => {
		const { connection, commits, prs } = makeCommitRecorder();

		await makeUpdater(connection, true).updateTemplate();

		expect(commits).toHaveLength(1);

		expect(commits[0].additions).toContainEqual({
			path: `Web/${TEMPLATE_VERSION_FILE}`,
			content: Base64.encode("1.93.0\n"),
		});
		expect(prs[0].title).toBe("Update template to version 1.93.0");
	});

	it("titles a re-apply PR as such", async () => {
		const { connection, prs } = makeCommitRecorder();

		await makeUpdater(connection, false).updateTemplate();

		expect(prs[0].title).toBe("Re-apply template version 1.93.0");
	});

	it("marks as up to date by committing only the version file", async () => {
		const { connection, commits } = makeCommitRecorder();

		await makeUpdater(connection, true).markAsUpToDate();

		expect(commits).toEqual([
			{
				additions: [
					{
						path: `Web/${TEMPLATE_VERSION_FILE}`,
						content: Base64.encode("1.93.0\n"),
					},
				],
				message: "Mark template as version 1.93.0",
			},
		]);
	});
});
