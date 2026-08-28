import { Base64 } from "js-base64";
import { GardenPluginManager } from "./GardenPluginManager";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import DigitalGardenSettings from "src/models/settings";
import { PublishPlatform } from "src/models/PublishPlatform";

const makeSettings = (contentBaseDir = "") =>
	({
		contentBaseDir,
		publishPlatform: PublishPlatform.SelfHosted,
	}) as DigitalGardenSettings;

const SEARCH_MANIFEST = {
	id: "dg-search",
	name: "Search",
	version: "1.0.0",
	description: "Site search",
	author: "Ole",
	noteSettings: ["dgEnableSearch"],
};

const COMMUNITY_MANIFEST = {
	id: "comments",
	name: "Comments",
	version: "2.0.0",
	description: "Comments under notes",
	author: "Jane",
	settings: [{ key: "repo", name: "Repo", type: "text", default: "" }],
};

interface IFakeUserRepo {
	files: Record<string, string>;
	updateCalls: { path: string; content: string; sha?: string }[];
	commitCalls: {
		additions?: { path: string; content: string }[];
		deletions?: string[];
		message: string;
	}[];
}

const makeUserConnection = (repo: IFakeUserRepo) =>
	({
		getContent: async () => ({
			tree: Object.entries(repo.files).map(([path, content]) => ({
				path,
				type: "blob",
				sha: `sha-${path}`,
				size: content.length,
			})),
		}),
		getFile: async (path: string) => {
			if (!(path in repo.files)) {
				throw new Error(`Could not get file ${path}`);
			}

			return {
				content: Base64.encode(repo.files[path]),
				sha: `sha-${path}`,
			};
		},
		updateFile: async (payload: {
			path: string;
			content: string;
			sha?: string;
		}) => {
			repo.updateCalls.push(payload);
			repo.files[payload.path] = Base64.decode(payload.content);

			return { status: 200 };
		},
		commitChanges: async (payload: IFakeUserRepo["commitCalls"][0]) => {
			repo.commitCalls.push(payload);

			for (const addition of payload.additions ?? []) {
				repo.files[addition.path] = Base64.decode(addition.content);
			}

			for (const deletion of payload.deletions ?? []) {
				delete repo.files[deletion];
			}
		},
	}) as unknown as RepositoryConnection;

const makeFakeRepo = (files: Record<string, string> = {}): IFakeUserRepo => ({
	files,
	updateCalls: [],
	commitCalls: [],
});

const makeSourceConnection = (source: {
	files: Record<string, string>;
	releaseTag?: string;
}) =>
	(() =>
		({
			getLatestRelease: async () =>
				source.releaseTag ? { tag_name: source.releaseTag } : undefined,
			getRepositoryInfo: async () => ({ default_branch: "main" }),
			getContent: async () => ({
				tree: Object.entries(source.files).map(([path, content]) => ({
					path,
					type: "blob",
					sha: `blob-${path}`,
					size: content.length,
				})),
			}),
			getFile: async (path: string) => ({
				content: Base64.encode(source.files[path]),
				sha: `blob-${path}`,
			}),
			getBlob: async (sha: string) => {
				const entry = Object.entries(source.files).find(
					([path]) => `blob-${path}` === sha,
				);

				return entry ? Base64.encode(entry[1]) : undefined;
			},
		}) as unknown as RepositoryConnection) as (
		owner: string,
		repo: string,
	) => RepositoryConnection;

describe.each([{ base: "" }, { base: "Web/" }])(
	"GardenPluginManager (contentBaseDir: '$base')",
	({ base }) => {
		const settings = makeSettings(base);

		describe("listInstalled", () => {
			it("enumerates plugins from the repo tree and merges registry state", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/dg-search/garden-plugin.json`]:
						JSON.stringify(SEARCH_MANIFEST),
					[`${base}src/plugins/comments/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
					[`${base}src/plugins/plugins.json`]: JSON.stringify({
						version: 1,
						plugins: { "dg-search": { enabled: false } },
					}),
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				const plugins = await manager.listInstalled();

				expect(plugins.map((p) => p.manifest.id)).toEqual([
					"comments",
					"dg-search",
				]);

				const search = plugins.find(
					(p) => p.manifest.id === "dg-search",
				);
				expect(search?.enabled).toBe(false);
				expect(search?.isFirstParty).toBe(true);

				const comments = plugins.find(
					(p) => p.manifest.id === "comments",
				);
				expect(comments?.enabled).toBe(true);
				expect(comments?.isFirstParty).toBe(false);
			});

			it("skips invalid manifests and nested manifest files", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/broken/garden-plugin.json`]:
						"{ not json",
					[`${base}src/plugins/deep/nested/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
					[`${base}src/plugins/comments/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				const plugins = await manager.listInstalled();

				expect(plugins.map((p) => p.manifest.id)).toEqual(["comments"]);
			});

			it("treats a malformed registry as absent", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/comments/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
					[`${base}src/plugins/plugins.json`]: "also { not json",
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				const plugins = await manager.listInstalled();

				expect(plugins[0].enabled).toBe(true);
			});
		});

		describe("setEnabled", () => {
			it("writes the flag into the registry preserving other entries", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/plugins.json`]: JSON.stringify({
						version: 1,
						plugins: { other: { enabled: false } },
					}),
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				await manager.setEnabled("dg-search", false);

				expect(repo.updateCalls).toHaveLength(1);

				expect(repo.updateCalls[0].path).toBe(
					`${base}src/plugins/plugins.json`,
				);

				const written = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				expect(written.plugins["dg-search"].enabled).toBe(false);
				expect(written.plugins.other.enabled).toBe(false);
			});

			it("creates the registry when none exists", async () => {
				const repo = makeFakeRepo();

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				await manager.setEnabled("comments", true);

				const written = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				expect(written.plugins.comments.enabled).toBe(true);
			});
		});

		describe("inspectRemotePlugin and install", () => {
			const sourceFiles = {
				"garden-plugin.json": JSON.stringify(COMMUNITY_MANIFEST),
				"templates/comments.njk": "<div>comments</div>",
				".github/workflows/ci.yml": "ci",
			};

			it("fetches, validates, and installs in one commit", async () => {
				const repo = makeFakeRepo();

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
					makeSourceConnection({
						files: sourceFiles,
						releaseTag: "v2.0.0",
					}),
				);

				const remote = await manager.inspectRemotePlugin(
					"https://github.com/jane/garden-plugin-comments",
				);

				expect(remote.ref).toBe("v2.0.0");
				expect(remote.manifest.id).toBe("comments");

				expect(remote.files.map((f) => f.path).sort()).toEqual([
					"garden-plugin.json",
					"templates/comments.njk",
				]);

				await manager.install(remote);

				expect(repo.commitCalls).toHaveLength(1);
				const commit = repo.commitCalls[0];

				expect(commit.message).toBe(
					"Install garden plugin comments (2.0.0)",
				);

				expect(commit.additions?.map((a) => a.path).sort()).toEqual([
					`${base}src/plugins/comments/garden-plugin.json`,
					`${base}src/plugins/comments/templates/comments.njk`,
					`${base}src/plugins/plugins.json`,
				]);

				const registry = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				const entry = registry.plugins.comments;
				expect(entry.repo).toBe("jane/garden-plugin-comments");
				expect(entry.installedVersion).toBe("2.0.0");
				expect(entry.installedRef).toBe("v2.0.0");
				expect(entry.enabled).toBe(true);

				expect(entry.files).toEqual([
					`${base}src/plugins/comments/garden-plugin.json`,
					`${base}src/plugins/comments/templates/comments.njk`,
				]);
			});

			it("falls back to the default branch when there is no release", async () => {
				const manager = new GardenPluginManager(
					makeUserConnection(makeFakeRepo()),
					settings,
					makeSourceConnection({ files: sourceFiles }),
				);

				const remote =
					await manager.inspectRemotePlugin("jane/comments");

				expect(remote.ref).toBe("main");
			});

			it("rejects a repo without a manifest", async () => {
				const manager = new GardenPluginManager(
					makeUserConnection(makeFakeRepo()),
					settings,
					makeSourceConnection({ files: { "README.md": "hi" } }),
				);

				await expect(
					manager.inspectRemotePlugin("jane/not-a-plugin"),
				).rejects.toThrow(/no garden-plugin.json/);
			});

			it("rejects a manifest with a reserved id", async () => {
				const manager = new GardenPluginManager(
					makeUserConnection(makeFakeRepo()),
					settings,
					makeSourceConnection({
						files: {
							"garden-plugin.json":
								JSON.stringify(SEARCH_MANIFEST),
						},
					}),
				);

				await expect(
					manager.inspectRemotePlugin("jane/fake-search"),
				).rejects.toThrow(/reserved/);
			});

			it("disables handed-over plugins in the same install commit", async () => {
				const repo = makeFakeRepo();

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
					makeSourceConnection({
						files: sourceFiles,
						releaseTag: "v2.0.0",
					}),
				);

				const remote =
					await manager.inspectRemotePlugin("jane/comments");

				await manager.install(remote, undefined, ["dg-filetree"]);

				expect(repo.commitCalls).toHaveLength(1);

				const registry = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				expect(registry.plugins["dg-filetree"].enabled).toBe(false);
				expect(registry.plugins.comments.enabled).toBe(true);
			});

			it("deletes orphaned files on update", async () => {
				const repo = makeFakeRepo();

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
					makeSourceConnection({
						files: sourceFiles,
						releaseTag: "v2.0.0",
					}),
				);

				const remote =
					await manager.inspectRemotePlugin("jane/comments");

				await manager.install(remote, {
					enabled: false,
					files: [
						`${base}src/plugins/comments/garden-plugin.json`,
						`${base}src/plugins/comments/old-file.js`,
					],
				});

				const commit = repo.commitCalls[0];

				expect(commit.deletions).toEqual([
					`${base}src/plugins/comments/old-file.js`,
				]);

				expect(commit.message).toBe(
					"Update garden plugin comments (2.0.0)",
				);

				const registry = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				expect(registry.plugins.comments.enabled).toBe(false);
			});
		});

		describe("uninstall", () => {
			it("removes recorded files and the registry entry in one commit", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/comments/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
					[`${base}src/plugins/plugins.json`]: JSON.stringify({
						version: 1,
						plugins: {
							comments: {
								files: [
									`${base}src/plugins/comments/garden-plugin.json`,
								],
							},
							other: { enabled: false },
						},
					}),
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				const [plugin] = await manager.listInstalled();
				await manager.uninstall(plugin);

				const commit = repo.commitCalls[0];

				expect(commit.deletions).toEqual([
					`${base}src/plugins/comments/garden-plugin.json`,
				]);

				const registry = JSON.parse(
					repo.files[`${base}src/plugins/plugins.json`],
				);
				expect(registry.plugins.comments).toBeUndefined();
				expect(registry.plugins.other).toBeDefined();
			});

			it("enumerates the plugin directory when the registry has no file list", async () => {
				const repo = makeFakeRepo({
					[`${base}src/plugins/comments/garden-plugin.json`]:
						JSON.stringify(COMMUNITY_MANIFEST),
					[`${base}src/plugins/comments/templates/x.njk`]: "x",
				});

				const manager = new GardenPluginManager(
					makeUserConnection(repo),
					settings,
				);

				const [plugin] = await manager.listInstalled();
				await manager.uninstall(plugin);

				expect(repo.commitCalls[0].deletions?.sort()).toEqual([
					`${base}src/plugins/comments/garden-plugin.json`,
					`${base}src/plugins/comments/templates/x.njk`,
				]);
			});
		});
	},
);
