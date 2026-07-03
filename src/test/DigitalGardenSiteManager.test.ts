import { MetadataCache } from "obsidian";
import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { TRepositoryContent } from "../repositoryConnection/RepositoryConnection";

jest.mock("obsidian");

const makeSettings = (contentBaseDir: string): DigitalGardenSettings =>
	({
		pathRewriteRules: "",
		contentBaseDir,
	}) as DigitalGardenSettings;

const makeTree = (base: string): NonNullable<TRepositoryContent> =>
	({
		tree: [
			{
				path: `${base}src/site/notes/note.md`,
				sha: "note-sha",
				type: "blob",
			},
			{
				path: `${base}src/site/notes/notes.json`,
				sha: "json-sha",
				type: "blob",
			},
			{
				path: `${base}src/site/img/user/pic.png`,
				sha: "img-sha",
				type: "blob",
			},
			// Files outside the garden base must be ignored.
			{ path: `README.md`, sha: "readme-sha", type: "blob" },
			{ path: `other/src/site/notes/x.md`, sha: "x-sha", type: "blob" },
		],
	}) as unknown as NonNullable<TRepositoryContent>;

describe("DigitalGardenSiteManager base stripping", () => {
	const makeManager = (contentBaseDir: string) =>
		new DigitalGardenSiteManager(
			{} as MetadataCache,
			makeSettings(contentBaseDir),
		);

	describe.each([
		{ label: "no base (repo root)", base: "" },
		{ label: "Web subfolder", base: "Web/" },
	])("$label", ({ base }) => {
		it("strips the base from note hashes and skips notes.json", async () => {
			const manager = makeManager(base.replace(/\/$/, ""));
			const hashes = await manager.getNoteHashes(makeTree(base));

			expect(hashes).toEqual({ "note.md": "note-sha" });
			expect(hashes["notes.json"]).toBeUndefined();
		});

		it("strips the base from image hashes", async () => {
			const manager = makeManager(base.replace(/\/$/, ""));
			const hashes = await manager.getImageHashes(makeTree(base));

			expect(hashes).toEqual({ "pic.png": "img-sha" });
		});
	});

	it("does not pick up files that share the suffix under a different base", async () => {
		// A repo-root garden must not treat `other/src/site/...` as its own.
		const manager = makeManager("");
		const hashes = await manager.getNoteHashes(makeTree(""));

		expect(Object.keys(hashes)).toEqual(["note.md"]);
	});
});
