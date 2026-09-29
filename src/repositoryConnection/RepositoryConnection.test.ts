import {
	MAX_TREE_ENTRIES_PER_COMMIT,
	RepositoryConnection,
} from "./RepositoryConnection";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { PublishBranchMissingError } from "./PublishBranchMissingError";

interface IRequest {
	route: string;
	payload: Record<string, unknown>;
}

const makeFakeOctokit = () => {
	const requests: IRequest[] = [];
	let blobCounter = 0;
	let treeCounter = 0;
	let commitCounter = 0;

	const request = async (route: string, payload: Record<string, unknown>) => {
		requests.push({ route, payload });

		if (route.startsWith("GET /repos/{owner}/{repo}/commits/{ref}")) {
			return {
				data: { sha: "commit-0", commit: { tree: { sha: "tree-0" } } },
			};
		}

		if (route === "GET /repos/{owner}/{repo}") {
			return { data: { default_branch: "main" } };
		}

		if (route === "POST /repos/{owner}/{repo}/git/blobs") {
			blobCounter += 1;

			return { data: { sha: `blob-${blobCounter}` } };
		}

		if (route === "POST /repos/{owner}/{repo}/git/trees") {
			treeCounter += 1;

			return { data: { sha: `tree-${treeCounter}` } };
		}

		if (route === "POST /repos/{owner}/{repo}/git/commits") {
			commitCounter += 1;

			return { data: { sha: `commit-${commitCounter}` } };
		}

		if (route === "PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}") {
			return { data: {} };
		}

		throw new Error(`Unexpected request ${route}`);
	};

	return { request, requests };
};

const makeFile = (index: number) =>
	({
		getPath: () => `/note-${index}.md`,
		compiledFile: [`content ${index}`, { images: [] }],
	}) as unknown as CompiledPublishFile;

const makeConnection = (octokit: ReturnType<typeof makeFakeOctokit>) =>
	new RepositoryConnection({
		octoKit: octokit as never,
		userName: "user",
		pageName: "garden",
		contentBaseDir: "",
	});

const byRoute = (requests: IRequest[], route: string) =>
	requests.filter((r) => r.route === route);

describe("RepositoryConnection.updateFiles", () => {
	it("publishes a small batch as a single commit", async () => {
		const octokit = makeFakeOctokit();
		const files = [makeFile(1), makeFile(2), makeFile(3)];

		await makeConnection(octokit).updateFiles(files);

		const trees = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/trees",
		);

		const commits = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/commits",
		);

		expect(trees).toHaveLength(1);
		expect(trees[0].payload.base_tree).toBe("tree-0");
		expect(trees[0].payload.tree).toHaveLength(3);
		expect(commits).toHaveLength(1);
		expect(commits[0].payload.message).toBe("Published multiple files");
		expect(commits[0].payload.parents).toEqual(["commit-0"]);
	});

	it("splits a large batch into chained commits that stay under the tree limit", async () => {
		const octokit = makeFakeOctokit();
		const fileCount = MAX_TREE_ENTRIES_PER_COMMIT * 2 + 5;

		const files = Array.from({ length: fileCount }, (_, i) => makeFile(i));
		const progress: [number, number, string][] = [];

		await makeConnection(octokit).updateFiles(files, {}, (done, total, m) =>
			progress.push([done, total, m]),
		);

		const trees = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/trees",
		);

		const commits = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/commits",
		);

		const refUpdates = byRoute(
			octokit.requests,
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
		);

		expect(trees).toHaveLength(3);

		for (const tree of trees) {
			expect((tree.payload.tree as unknown[]).length).toBeLessThanOrEqual(
				MAX_TREE_ENTRIES_PER_COMMIT,
			);
		}

		const totalEntries = trees.reduce(
			(sum, t) => sum + (t.payload.tree as unknown[]).length,
			0,
		);
		expect(totalEntries).toBe(fileCount);

		// Each tree builds on the tree produced by the previous commit.
		expect(trees.map((t) => t.payload.base_tree)).toEqual([
			"tree-0",
			"tree-1",
			"tree-2",
		]);

		// Each commit has the previous commit as its parent.
		expect(commits.map((c) => c.payload.parents)).toEqual([
			["commit-0"],
			["commit-1"],
			["commit-2"],
		]);

		expect(commits.map((c) => c.payload.message)).toEqual([
			"Published multiple files (1/3)",
			"Published multiple files (2/3)",
			"Published multiple files (3/3)",
		]);

		// The branch is advanced after every commit so partial progress is kept.
		expect(refUpdates.map((r) => r.payload.sha)).toEqual([
			"commit-1",
			"commit-2",
			"commit-3",
		]);

		const [done, total, message] = progress[progress.length - 1];
		expect(message).toBe("Published");
		expect(done).toBe(total);
		expect(total).toBe(fileCount + 3);
	});

	it("advances the default branch when no publish branch is set", async () => {
		const octokit = makeFakeOctokit();

		await makeConnection(octokit).updateFiles([makeFile(1)]);

		const refUpdates = byRoute(
			octokit.requests,
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
		);

		expect(refUpdates.map((r) => r.payload.branch)).toEqual(["main"]);

		expect(
			byRoute(
				octokit.requests,
				"GET /repos/{owner}/{repo}/git/ref/{ref}",
			),
		).toHaveLength(0);
	});
});

describe("RepositoryConnection.deleteFiles", () => {
	it("deletes a small batch in a single commit using the base tree", async () => {
		const octokit = makeFakeOctokit();

		await makeConnection(octokit).deleteFiles([
			"src/site/notes/a.md",
			"src/site/img/user/b.png",
		]);

		const trees = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/trees",
		);

		const commits = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/commits",
		);

		expect(trees).toHaveLength(1);
		expect(trees[0].payload.base_tree).toBe("tree-0");

		expect(trees[0].payload.tree).toEqual([
			{
				path: "src/site/notes/a.md",
				mode: "100644",
				type: "blob",
				sha: null,
			},
			{
				path: "src/site/img/user/b.png",
				mode: "100644",
				type: "blob",
				sha: null,
			},
		]);
		expect(commits[0].payload.message).toBe("Deleted multiple files");
	});

	it("splits a large deletion into chained commits", async () => {
		const octokit = makeFakeOctokit();
		const count = MAX_TREE_ENTRIES_PER_COMMIT + 1;

		const paths = Array.from(
			{ length: count },
			(_, i) => `src/site/notes/${i}.md`,
		);
		const progress: [number, number, string][] = [];

		await makeConnection(octokit).deleteFiles(paths, (done, total, m) =>
			progress.push([done, total, m]),
		);

		const trees = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/trees",
		);

		const commits = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/commits",
		);

		const refUpdates = byRoute(
			octokit.requests,
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
		);

		expect(trees.map((t) => (t.payload.tree as unknown[]).length)).toEqual([
			MAX_TREE_ENTRIES_PER_COMMIT,
			1,
		]);

		expect(trees.map((t) => t.payload.base_tree)).toEqual([
			"tree-0",
			"tree-1",
		]);

		expect(commits.map((c) => c.payload.parents)).toEqual([
			["commit-0"],
			["commit-1"],
		]);

		expect(refUpdates.map((r) => r.payload.sha)).toEqual([
			"commit-1",
			"commit-2",
		]);

		const [done, total, message] = progress[progress.length - 1];
		expect(message).toBe("Deleted");
		expect(done).toBe(total);
		expect(total).toBe(count + 2);
	});

	it("does nothing for an empty list", async () => {
		const octokit = makeFakeOctokit();

		await makeConnection(octokit).deleteFiles([]);

		expect(octokit.requests).toHaveLength(0);
	});
});

/**
 * Fake GitHub where the default branch `main` is at commit-0 and the publish
 * branch `drafts` (when it exists) is at drafts-commit.
 */
const makeBranchOctokit = ({ branchExists }: { branchExists: boolean }) => {
	const requests: IRequest[] = [];
	let counter = 0;

	const notFound = () =>
		Object.assign(new Error("Not Found"), { status: 404 });

	const request = async (route: string, payload: Record<string, unknown>) => {
		requests.push({ route, payload });

		if (route === "GET /repos/{owner}/{repo}/git/ref/{ref}") {
			if (!branchExists) throw notFound();

			return { data: {} };
		}

		if (route.startsWith("GET /repos/{owner}/{repo}/commits/{ref}")) {
			const onBranch = payload.ref === "drafts";

			return {
				data: {
					sha: onBranch ? "drafts-commit" : "commit-0",
					commit: {
						tree: { sha: onBranch ? "drafts-tree" : "tree-0" },
					},
				},
			};
		}

		if (route.startsWith("GET /repos/{owner}/{repo}/contents/{path}")) {
			return { data: { type: "file", sha: "file-sha", content: "" } };
		}

		if (route === "GET /repos/{owner}/{repo}") {
			return { data: { default_branch: "main" } };
		}

		if (
			route === "PUT /repos/{owner}/{repo}/contents/{path}" ||
			route === "PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}"
		) {
			return { data: {} };
		}

		counter += 1;

		return { data: { sha: `new-${counter}` } };
	};

	return { request, requests };
};

const makeBranchConnection = (octokit: ReturnType<typeof makeBranchOctokit>) =>
	new RepositoryConnection({
		octoKit: octokit as never,
		userName: "user",
		pageName: "garden",
		contentBaseDir: "",
		branch: "drafts",
	});

describe("RepositoryConnection with a publish branch", () => {
	it("commits onto the publish branch when it exists", async () => {
		const octokit = makeBranchOctokit({ branchExists: true });

		await makeBranchConnection(octokit).updateFiles([makeFile(1)]);

		const [tree] = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/trees",
		);

		const [commit] = byRoute(
			octokit.requests,
			"POST /repos/{owner}/{repo}/git/commits",
		);

		const refUpdates = byRoute(
			octokit.requests,
			"PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}",
		);

		expect(tree.payload.base_tree).toBe("drafts-tree");
		expect(commit.payload.parents).toEqual(["drafts-commit"]);
		expect(refUpdates.map((r) => r.payload.branch)).toEqual(["drafts"]);
	});

	it("fails batch writes without creating a missing publish branch", async () => {
		const octokit = makeBranchOctokit({ branchExists: false });

		await expect(
			makeBranchConnection(octokit).deleteFiles(["src/site/notes/a.md"]),
		).rejects.toBeInstanceOf(PublishBranchMissingError);

		const writes = octokit.requests.filter(
			(r) => !r.route.startsWith("GET "),
		);

		expect(writes).toHaveLength(0);
	});

	it("fails single-file writes instead of swallowing a missing publish branch", async () => {
		const octokit = makeBranchOctokit({ branchExists: false });

		await expect(
			makeBranchConnection(octokit).updateFile({
				path: "src/site/env",
				content: "",
			}),
		).rejects.toThrow('The publish branch "drafts" does not exist');

		expect(
			byRoute(
				octokit.requests,
				"PUT /repos/{owner}/{repo}/contents/{path}",
			),
		).toHaveLength(0);
	});

	it("reads from the publish branch when it exists", async () => {
		const octokit = makeBranchOctokit({ branchExists: true });

		await makeBranchConnection(octokit).getFile("src/site/env");

		const [read] = octokit.requests.filter((r) =>
			r.route.startsWith("GET /repos/{owner}/{repo}/contents/{path}"),
		);

		expect(read.payload.ref).toBe("drafts");
	});

	it("reads from the default branch when the publish branch is missing", async () => {
		const octokit = makeBranchOctokit({ branchExists: false });
		const connection = makeBranchConnection(octokit);

		await connection.getFile("src/site/env");
		await connection.getLatestCommit();

		const [read] = octokit.requests.filter((r) =>
			r.route.startsWith("GET /repos/{owner}/{repo}/contents/{path}"),
		);

		const [commit] = octokit.requests.filter((r) =>
			r.route.startsWith("GET /repos/{owner}/{repo}/commits/{ref}"),
		);

		expect(read.payload.ref).toBeUndefined();
		expect(commit.payload.ref).toBe("HEAD");
	});

	it("sends single-file writes to the publish branch", async () => {
		const octokit = makeBranchOctokit({ branchExists: true });

		await makeBranchConnection(octokit).updateFile({
			path: "src/site/env",
			content: "",
		});

		const [put] = byRoute(
			octokit.requests,
			"PUT /repos/{owner}/{repo}/contents/{path}",
		);

		expect(put.payload.branch).toBe("drafts");
	});
});
