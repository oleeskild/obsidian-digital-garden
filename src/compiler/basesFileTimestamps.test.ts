import { MetadataCache, TFile, Vault } from "obsidian";
import {
	baseBlocksUseFileTimestamps,
	publishedBasesUseFileTimestamps,
} from "./basesFileTimestamps";

jest.mock("obsidian");

describe("baseBlocksUseFileTimestamps", () => {
	it("finds file.ctime / file.mtime inside a base block", () => {
		const text = [
			"# Logs",
			"```base",
			"views:",
			"  - type: table",
			"    sort:",
			"      - property: file.ctime",
			"        direction: DESC",
			"```",
		].join("\n");

		expect(baseBlocksUseFileTimestamps(text)).toBe(true);

		expect(
			baseBlocksUseFileTimestamps(
				text.replace("file.ctime", "file.mtime"),
			),
		).toBe(true);
	});

	it("ignores mentions outside base blocks and other properties", () => {
		const text = [
			"Sort by `file.ctime` in your bases.",
			"```js",
			"file.mtime",
			"```",
			"```base",
			"views:",
			"  - type: table",
			"    order: [file.name, file.ctimes]",
			"```",
		].join("\n");

		expect(baseBlocksUseFileTimestamps(text)).toBe(false);
	});
});

type FakeNote = {
	path: string;
	publish?: boolean;
	text?: string;
	embeds?: string[];
};

function fakeVault(notes: FakeNote[], baseFiles: Record<string, string>) {
	const reads: string[] = [];
	const files = notes.map((n) => ({ path: n.path, extension: "md" }));

	const vault = {
		getMarkdownFiles: () => files,
		cachedRead: async (file: TFile) => {
			reads.push(file.path);

			return (
				notes.find((n) => n.path === file.path)?.text ??
				baseFiles[file.path] ??
				""
			);
		},
	} as unknown as Vault;

	const metadataCache = {
		getFileCache: (file: TFile) => {
			const note = notes.find((n) => n.path === file.path);

			return {
				frontmatter: note?.publish ? { "dg-publish": true } : {},
				sections: note?.text?.includes("```")
					? [{ type: "code" }]
					: [{ type: "paragraph" }],
				embeds: (note?.embeds ?? []).map((link) => ({ link })),
			};
		},
		getFirstLinkpathDest: (linkpath: string) =>
			baseFiles[linkpath] !== undefined
				? { path: linkpath, extension: "base" }
				: null,
	} as unknown as MetadataCache;

	return { vault, metadataCache, reads };
}

describe("publishedBasesUseFileTimestamps", () => {
	const ctimeBlock =
		"```base\nviews:\n  - sort:\n      - property: file.ctime\n```";

	it("detects an inline base block in a published note", async () => {
		const { vault, metadataCache } = fakeVault(
			[{ path: "a.md", publish: true, text: ctimeBlock }],
			{},
		);

		await expect(
			publishedBasesUseFileTimestamps(vault, metadataCache),
		).resolves.toBe(true);
	});

	it("detects an embedded .base file, including a view-specific embed", async () => {
		const { vault, metadataCache } = fakeVault(
			[{ path: "a.md", publish: true, embeds: ["Logs.base#Recent"] }],
			{ "Logs.base": "views:\n  - order: [file.name, file.mtime]\n" },
		);

		await expect(
			publishedBasesUseFileTimestamps(vault, metadataCache),
		).resolves.toBe(true);
	});

	it("ignores unpublished notes and only reads notes with code blocks", async () => {
		const { vault, metadataCache, reads } = fakeVault(
			[
				{ path: "draft.md", publish: false, text: ctimeBlock },
				{ path: "plain.md", publish: true, text: "Just prose" },
				{
					path: "code.md",
					publish: true,
					text: "```base\nviews:\n  - order: [file.name]\n```",
				},
			],
			{},
		);

		await expect(
			publishedBasesUseFileTimestamps(vault, metadataCache),
		).resolves.toBe(false);
		expect(reads).toEqual(["code.md"]);
	});
});
