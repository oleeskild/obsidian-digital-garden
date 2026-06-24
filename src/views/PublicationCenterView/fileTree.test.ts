import { buildFileTree, collectFilePaths, filterTree } from "./fileTree";
import { AnnotatedFile } from "./annotate";

const files: AnnotatedFile[] = [
	{ path: "notes/b.md", status: "changed", isImage: false },
	{ path: "notes/a.md", status: "new", isImage: false },
	{ path: "root.md", status: "published", isImage: false },
	{ path: "notes/sub/c.md", status: "deleted", isImage: false },
];

describe("buildFileTree", () => {
	it("nests files into folders", () => {
		const tree = buildFileTree(files);
		const top = tree.children!.map((c) => c.name);
		// folders before files, each alphabetical
		expect(top).toEqual(["notes", "root.md"]);

		const notes = tree.children!.find((c) => c.name === "notes")!;
		expect(notes.isFolder).toBe(true);
		const notesChildren = notes.children!.map((c) => c.name);
		// sub-folder first, then files alphabetically
		expect(notesChildren).toEqual(["sub", "a.md", "b.md"]);
	});

	it("annotates leaf nodes with status and full path", () => {
		const tree = buildFileTree(files);
		const notes = tree.children!.find((c) => c.name === "notes")!;
		const a = notes.children!.find((c) => c.name === "a.md")!;
		expect(a.isFolder).toBe(false);
		expect(a.path).toBe("notes/a.md");
		expect(a.status).toBe("new");
	});
});

describe("collectFilePaths", () => {
	it("returns all leaf paths under a folder", () => {
		const tree = buildFileTree(files);
		const notes = tree.children!.find((c) => c.name === "notes")!;

		expect(collectFilePaths(notes).sort()).toEqual([
			"notes/a.md",
			"notes/b.md",
			"notes/sub/c.md",
		]);
	});
});

describe("filterTree", () => {
	it("keeps only files whose status is active, pruning empty folders", () => {
		const tree = buildFileTree(files);
		const filtered = filterTree(tree, new Set(["new"]))!;
		const leafPaths = collectFilePaths(filtered);
		expect(leafPaths).toEqual(["notes/a.md"]);
	});

	it("returns a root with empty children when nothing matches", () => {
		const tree = buildFileTree(files);
		const filtered = filterTree(tree, new Set())!;
		expect(filtered.path).toBe("");
		expect(filtered.children).toEqual([]);
	});
});
