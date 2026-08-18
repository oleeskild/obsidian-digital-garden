import { MetadataCache } from "obsidian";
import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { TRepositoryContent } from "../repositoryConnection/RepositoryConnection";

jest.mock("obsidian");

const settings = {
	pathRewriteRules: "",
	notesDirectory: "content/articles",
	assetsDirectory: "public/uploads",
} as DigitalGardenSettings;

const tree = {
	tree: [
		{ path: "content/articles/note.md", sha: "note-sha", type: "blob" },
		{ path: "content/articles/notes.json", sha: "json-sha", type: "blob" },
		{ path: "public/uploads/pic.png", sha: "img-sha", type: "blob" },
		{ path: "README.md", sha: "readme-sha", type: "blob" },
		{ path: "other/content/articles/x.md", sha: "x-sha", type: "blob" },
	],
} as unknown as NonNullable<TRepositoryContent>;

describe("DigitalGardenSiteManager custom paths", () => {
	const manager = new DigitalGardenSiteManager({} as MetadataCache, settings);

	it("strips the configured notes directory and skips notes.json", async () => {
		await expect(manager.getNoteHashes(tree)).resolves.toEqual({
			"note.md": "note-sha",
		});
	});

	it("strips the configured assets directory", async () => {
		await expect(manager.getImageHashes(tree)).resolves.toEqual({
			"pic.png": "img-sha",
		});
	});
});
