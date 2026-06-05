import { FrontMatterCache } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { FrontmatterCompiler } from "./FrontmatterCompiler";
import { PublishFile } from "../publishFile/PublishFile";

jest.mock("obsidian");

const getCompiler = (settings: Partial<DigitalGardenSettings> = {}) =>
	new FrontmatterCompiler({
		pathRewriteRules: "",
		slugifyEnabled: true,
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		showNoteIconInFileTree: false,
		showNoteIconOnInternalLink: false,
		showNoteIconOnTitle: false,
		showNoteIconOnBackLink: false,
		defaultNoteSettings: {},
		...settings,
	} as unknown as DigitalGardenSettings);

const fakeFile = (path = "test.md") =>
	({
		getPath: () => path,
		meta: {
			getUpdatedAt: () => undefined,
			getCreatedAt: () => undefined,
		},
	}) as unknown as PublishFile;

const parsePublished = (compiled: string) => {
	const match = compiled.match(/^---\n([\s\S]*?)\n---/);

	if (!match) throw new Error("no frontmatter block found");

	return JSON.parse(match[1]) as Record<string, unknown>;
};

describe("FrontmatterCompiler hide flags", () => {
	it("maps dg-hide-in-filetree to hideInFiletree", () => {
		const compiler = getCompiler();

		const result = compiler.compile(fakeFile(), {
			"dg-hide-in-filetree": true,
		} as unknown as FrontMatterCache);

		expect(parsePublished(result).hideInFiletree).toBe(true);
	});

	it("does not leak dg-hide-in-filetree into user properties", () => {
		const compiler = getCompiler();

		const result = compiler.compile(fakeFile(), {
			"dg-hide-in-filetree": true,
		} as unknown as FrontMatterCache);

		const props = parsePublished(result)["dg-note-properties"] as Record<
			string,
			unknown
		>;
		expect(props["dg-hide-in-filetree"]).toBeUndefined();
	});

	it("still maps dg-hide to hide", () => {
		const compiler = getCompiler();

		const result = compiler.compile(fakeFile(), {
			"dg-hide": true,
		} as unknown as FrontMatterCache);

		expect(parsePublished(result).hide).toBe(true);
	});

	it("still maps dg-hide-in-graph to hideInGraph", () => {
		const compiler = getCompiler();

		const result = compiler.compile(fakeFile(), {
			"dg-hide-in-graph": true,
		} as unknown as FrontMatterCache);

		expect(parsePublished(result).hideInGraph).toBe(true);
	});
});
