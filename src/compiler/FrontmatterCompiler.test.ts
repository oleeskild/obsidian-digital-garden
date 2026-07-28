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

// compile() emits JSON (not YAML) between ---…--- fences
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

describe("FrontmatterCompiler image property resolution", () => {
	// Vault layout the fake metadataCache resolves against
	const vaultImages: Record<string, string> = {
		"cover.jpg": "06 Assets/covers/cover.jpg",
		"06 Assets/covers/cover.jpg": "06 Assets/covers/cover.jpg",
		"attachments/cover.jpg": "06 Assets/attachments/cover.jpg",
	};

	const fakeFileWithVault = (path = "notes/test.md") =>
		({
			getPath: () => path,
			meta: {
				getUpdatedAt: () => undefined,
				getCreatedAt: () => undefined,
			},
			metadataCache: {
				getFirstLinkpathDest: (linkpath: string) =>
					vaultImages[linkpath]
						? { path: vaultImages[linkpath] }
						: null,
			},
		}) as unknown as PublishFile;

	const getUserProps = (frontmatter: Record<string, unknown>) => {
		const compiler = getCompiler();

		const result = compiler.compile(
			fakeFileWithVault(),
			frontmatter as unknown as FrontMatterCache,
		);

		return parsePublished(result)["dg-note-properties"] as Record<
			string,
			unknown
		>;
	};

	it("resolves shortest-path wikilink image values to full vault paths", () => {
		const props = getUserProps({ cover: "[[cover.jpg]]" });
		expect(props.cover).toBe("[[06 Assets/covers/cover.jpg]]");
	});

	it("keeps already-full wikilink image paths unchanged", () => {
		const props = getUserProps({
			cover: "[[06 Assets/covers/cover.jpg]]",
		});
		expect(props.cover).toBe("[[06 Assets/covers/cover.jpg]]");
	});

	it("preserves embed marker and alias when resolving", () => {
		const props = getUserProps({ cover: "![[cover.jpg|300]]" });
		expect(props.cover).toBe("![[06 Assets/covers/cover.jpg|300]]");
	});

	it("resolves plain path image values", () => {
		const props = getUserProps({ cover: "attachments/cover.jpg" });
		expect(props.cover).toBe("06 Assets/attachments/cover.jpg");
	});

	it("leaves unresolvable image wikilinks untouched", () => {
		const props = getUserProps({ cover: "[[missing.jpg]]" });
		expect(props.cover).toBe("[[missing.jpg]]");
	});

	it("leaves note wikilinks untouched", () => {
		const props = getUserProps({ author: "[[David Berman]]" });
		expect(props.author).toBe("[[David Berman]]");
	});

	it("leaves external image URLs untouched", () => {
		const props = getUserProps({
			cover: "https://example.com/cover.jpg",
		});
		expect(props.cover).toBe("https://example.com/cover.jpg");
	});
});

describe("FrontmatterCompiler note link resolution", () => {
	const vaultFiles: Record<string, string> = {
		"David Berman": "06 Assets/Lyrics/Artists/David Berman.md",
		"cover.jpg": "06 Assets/covers/cover.jpg",
	};

	const fakeFileWithNotes = (path = "notes/test.md") =>
		({
			getPath: () => path,
			meta: {
				getUpdatedAt: () => undefined,
				getCreatedAt: () => undefined,
			},
			metadataCache: {
				getFirstLinkpathDest: (linkpath: string) =>
					vaultFiles[linkpath]
						? { path: vaultFiles[linkpath] }
						: null,
			},
		}) as unknown as PublishFile;

	const getUserProps = (frontmatter: Record<string, unknown>) => {
		const compiler = getCompiler();

		const result = compiler.compile(
			fakeFileWithNotes(),
			frontmatter as unknown as FrontMatterCache,
		);

		return parsePublished(result)["dg-note-properties"] as Record<
			string,
			unknown
		>;
	};

	it("resolves bare note wikilinks to full vault paths without .md", () => {
		const props = getUserProps({ author: "[[David Berman]]" });
		expect(props.author).toBe("[[06 Assets/Lyrics/Artists/David Berman]]");
	});

	it("resolves note wikilinks inside arrays", () => {
		const props = getUserProps({
			authors: ["[[David Berman]]", "[[Nobody]]"],
		});

		expect(props.authors).toEqual([
			"[[06 Assets/Lyrics/Artists/David Berman]]",
			"[[Nobody]]",
		]);
	});

	it("resolves image wikilinks inside arrays", () => {
		const props = getUserProps({ covers: ["[[cover.jpg]]"] });
		expect(props.covers).toEqual(["[[06 Assets/covers/cover.jpg]]"]);
	});

	it("preserves alias on resolved note links", () => {
		const props = getUserProps({ author: "[[David Berman|Dave]]" });

		expect(props.author).toBe(
			"[[06 Assets/Lyrics/Artists/David Berman|Dave]]",
		);
	});
});
