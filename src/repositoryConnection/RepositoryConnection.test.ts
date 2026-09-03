import {
	MAX_TREE_ENTRIES_PER_COMMIT,
	RepositoryConnection,
} from "./RepositoryConnection";
import { CompiledPublishFile } from "src/publishFile/PublishFile";

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

		if (route.startsWith("GET /repos/{owner}/{repo}/commits/HEAD")) {
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
