import { Base64 } from "js-base64";
import {
	TemplateUpdateChecker,
	TemplateUpdater,
} from "../repositoryConnection/TemplateManager";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";

const PLUGIN_INFO = {
	filesToAdd: ["src/site/new.njk"],
	filesToModify: ["package.json"],
	filesToDelete: ["old.js"],
};

const makeBaseConnection = (calls: string[] = []) =>
	({
		getFile: async (path: string) => {
			calls.push(path);

			return {
				content: Base64.encode(
					path === "plugin-info.json"
						? JSON.stringify(PLUGIN_INFO)
						: "template file content",
				),
			};
		},
		getContent: async () => ({
			tree: [
				{ path: "package.json", sha: "pkg-sha", type: "blob" },
				{ path: "src/site/new.njk", sha: "new-sha", type: "blob" },
			],
		}),
		getRepositoryInfo: async () => ({ default_branch: "main" }),
	}) as unknown as RepositoryConnection;

describe("template operations", () => {
	it("checks template files at the repository root", async () => {
		const checker = new TemplateUpdateChecker({
			baseGardenConnection: makeBaseConnection(),
			userGardenConnection: {
				getContent: async () => ({
					tree: [
						{ path: "package.json", sha: "pkg-sha", type: "blob" },
						{
							path: "src/site/new.njk",
							sha: "new-sha",
							type: "blob",
						},
					],
				}),
			} as unknown as RepositoryConnection,
		});

		await expect(checker.getFilesToUpdate()).resolves.toBeNull();
	});

	it("writes template updates at repository-root paths", async () => {
		const fetched: string[] = [];
		const deleted: string[] = [];
		const updated: string[] = [];

		const userConnection = {
			getLatestCommit: async () => ({ sha: "commit-sha" }),
			createBranch: async () => undefined,
			deleteFile: async (path: string) => {
				deleted.push(path);

				return true;
			},
			updateFile: async ({ path }: { path: string }) =>
				updated.push(path),
			getBasePayload: () => ({ owner: "user", repo: "repo" }),
			octokit: {
				request: async () => ({ data: { html_url: "pr-url" } }),
			},
		} as unknown as RepositoryConnection;

		const updater = new TemplateUpdater({
			baseGardenConnection: makeBaseConnection(fetched),
			userGardenConnection: userConnection,
			defaultBranch: "main",
			newestTemplateVersion: "1.0.0",
			filesToChange: {
				filesToDelete: [{ path: "old.js", sha: "old-sha" }],
				filesToUpdate: [{ path: "package.json", sha: "old-pkg" }],
				filesToAdd: [{ path: "src/site/new.njk" }],
			},
		});

		await updater.updateTemplate();
		expect(deleted).toEqual(["old.js"]);

		expect(updated).toEqual(
			expect.arrayContaining(["package.json", "src/site/new.njk"]),
		);

		expect(fetched).toEqual(
			expect.arrayContaining(["package.json", "src/site/new.njk"]),
		);
	});
});
