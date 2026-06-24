import {
	annotateFiles,
	defaultSelection,
	buildPublishPlan,
	AnnotatedFile,
} from "./annotate";
import { PublishStatus } from "../../publisher/PublishStatusManager";
import { CompiledPublishFile } from "../../publishFile/PublishFile";

const fakeFile = (path: string) =>
	({ getPath: () => path }) as unknown as CompiledPublishFile;

const status: PublishStatus = {
	changedNotes: [fakeFile("a/changed.md")],
	unpublishedNotes: [fakeFile("b/new.md")],
	publishedNotes: [fakeFile("c/synced.md")],
	deletedNotePaths: [{ path: "d/gone.md", sha: "s1" }],
	deletedImagePaths: [{ path: "img/old.png", sha: "s2" }],
};

describe("annotateFiles", () => {
	it("flattens all five categories into annotated files", () => {
		const files = annotateFiles(status);
		expect(files).toHaveLength(5);

		const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
		expect(byPath["a/changed.md"].status).toBe("changed");
		expect(byPath["b/new.md"].status).toBe("new");
		expect(byPath["c/synced.md"].status).toBe("published");
		expect(byPath["d/gone.md"].status).toBe("deleted");
		expect(byPath["d/gone.md"].isImage).toBe(false);
		expect(byPath["img/old.png"].status).toBe("deleted");
		expect(byPath["img/old.png"].isImage).toBe(true);
	});
});

describe("defaultSelection", () => {
	it("selects everything except published notes", () => {
		const sel = defaultSelection(annotateFiles(status));
		expect(sel.has("a/changed.md")).toBe(true);
		expect(sel.has("b/new.md")).toBe(true);
		expect(sel.has("d/gone.md")).toBe(true);
		expect(sel.has("img/old.png")).toBe(true);
		expect(sel.has("c/synced.md")).toBe(false);
	});
});

describe("buildPublishPlan", () => {
	it("routes selected files to publish/delete buckets and skips unselected", () => {
		const files = annotateFiles(status);
		const selected = new Set([
			"a/changed.md",
			"b/new.md",
			"d/gone.md",
			"img/old.png",
			// c/synced.md intentionally selected to prove published is skipped
			"c/synced.md",
		]);
		const plan = buildPublishPlan(selected, files);

		expect(plan.notesToPublish.map((f) => f.getPath()).sort()).toEqual([
			"a/changed.md",
			"b/new.md",
		]);
		expect(plan.notesToDelete).toEqual(["d/gone.md"]);
		expect(plan.imagesToDelete).toEqual(["img/old.png"]);
	});

	it("omits files that are not selected", () => {
		const files = annotateFiles(status);
		const plan = buildPublishPlan(new Set<string>(), files);
		expect(plan.notesToPublish).toHaveLength(0);
		expect(plan.notesToDelete).toHaveLength(0);
		expect(plan.imagesToDelete).toHaveLength(0);
	});
});
