import {
	describeRemovalShare,
	describeRemovals,
	listNames,
	publishButtonDescription,
	publishButtonLabel,
	summarizePlan,
	visibleSelection,
} from "./publishSummary";
import { CompiledPublishFile } from "../../publishFile/PublishFile";

const fakeFile = (path: string) =>
	({ getPath: () => path }) as unknown as CompiledPublishFile;

describe("summarizePlan", () => {
	it("counts publishes and lists removals, notes before images", () => {
		const summary = summarizePlan({
			notesToPublish: [fakeFile("a.md"), fakeFile("b.md")],
			notesToDelete: ["gone.md"],
			imagesToDelete: ["img/old.png"],
		});

		expect(summary.publishCount).toBe(2);
		expect(summary.removeCount).toBe(2);
		expect(summary.removePaths).toEqual(["gone.md", "img/old.png"]);
	});
});

describe("visibleSelection", () => {
	it("drops selected paths hidden by the filters", () => {
		const sel = visibleSelection(new Set(["a", "b", "hidden"]), ["a", "b"]);
		expect([...sel].sort()).toEqual(["a", "b"]);
	});
});

describe("publishButtonLabel", () => {
	const s = (publishCount: number, removeCount: number, siteCount = 0) => ({
		publishCount,
		removeCount,
		removePaths: [],
		siteCount,
	});

	it("names both actions when the publish removes files", () => {
		expect(publishButtonLabel(s(6, 2))).toBe("Publish 6 · Remove 2");

		expect(publishButtonDescription(s(6, 2))).toBe(
			"Publish 6 notes and remove 2 files from your site",
		);
	});

	it("names only the action that happens", () => {
		expect(publishButtonLabel(s(3, 0))).toBe("Publish 3");
		expect(publishButtonLabel(s(0, 1))).toBe("Remove 1");
		expect(publishButtonLabel(s(0, 0))).toBe("Publish");

		expect(publishButtonDescription(s(0, 1))).toBe(
			"Remove 1 file from your site",
		);
		expect(publishButtonDescription(s(1, 0))).toBe("Publish 1 note");
	});
});

describe("site changes in the label", () => {
	const s = (
		publishCount: number,
		removeCount: number,
		siteCount: number,
	) => ({
		publishCount,
		removeCount,
		removePaths: [],
		siteCount,
	});

	it("adds site settings to the counts", () => {
		expect(publishButtonLabel(s(6, 2, 3))).toBe(
			"Publish 6 · Remove 2 · Site 3",
		);

		expect(publishButtonDescription(s(6, 2, 3))).toBe(
			"Publish 6 notes, remove 2 files from your site and publish 3 site settings",
		);
	});

	it("reads as a publish when only site settings changed", () => {
		expect(publishButtonLabel(s(0, 0, 1))).toBe("Publish 1 site setting");

		expect(publishButtonDescription(s(0, 0, 2))).toBe(
			"Publish 2 site settings",
		);
	});
});

describe("listNames", () => {
	it("joins up to three file names", () => {
		expect(listNames(["x/a.md"])).toBe("a.md");
		expect(listNames(["a.md", "b.md"])).toBe("a.md and b.md");
		expect(listNames(["a.md", "b.md", "c.md"])).toBe("a.md, b.md and c.md");
	});

	it("summarises the rest", () => {
		expect(listNames(["a.md", "b.md", "c.md", "d.md", "e.md"])).toBe(
			"a.md, b.md, c.md and 2 more",
		);
	});
});

describe("describeRemovals", () => {
	it("says a shared reason once", () => {
		expect(describeRemovals(["x/a.md", "b.md"], () => "unpublished")).toBe(
			"a.md and b.md: unpublished",
		);
	});

	it("names each reason when they differ", () => {
		const reason = (p: string) =>
			p === "a.md" ? "unpublished" : "not in your vault";

		expect(describeRemovals(["a.md", "b.png"], reason)).toBe(
			"a.md (unpublished) and b.png (not in your vault)",
		);

		expect(
			describeRemovals(["a.md", "b.png", "c.md", "d.md"], reason),
		).toBe(
			"a.md (unpublished), b.png (not in your vault), c.md (not in your vault) and 1 more",
		);
	});
});

describe("describeRemovalShare", () => {
	it("says nothing about a small removal", () => {
		expect(describeRemovalShare(2, 52)).toBeNull();
		expect(describeRemovalShare(5, 52)).toBeNull();
	});

	it("names a large share of the site", () => {
		expect(describeRemovalShare(40, 52)).toBe(
			"That's 40 of your 52 published notes.",
		);

		expect(describeRemovalShare(3, 10)).toBe(
			"That's 3 of your 10 published notes.",
		);
	});

	it("names a long removal even on a big site", () => {
		expect(describeRemovalShare(20, 500)).toBe(
			"That's 20 of your 500 published notes.",
		);
	});

	it("calls out removing everything", () => {
		expect(describeRemovalShare(12, 12)).toBe(
			"That's every note on your site.",
		);
	});
});
