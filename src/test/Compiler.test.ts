import {
	MetadataCache,
	parseYaml,
	stringifyYaml,
	TFile,
	Vault,
} from "obsidian";
import Logger from "js-logger";
import DigitalGardenSettings from "../models/settings";
import {
	createBaseCodeBlock,
	GardenPageCompiler,
	getFrontmatterImageLinkpath,
	selectBaseView,
} from "../compiler/GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";
import { TRANSCLUDED_SVG_REGEX } from "../utils/regexes";

jest.mock("obsidian", () => ({
	parseYaml: jest.fn(),
	stringifyYaml: jest.fn(),
	getLinkpath: (linkpath: string) => linkpath,
}));

describe("Compiler", () => {
	const getTestCompiler = (settings: Partial<DigitalGardenSettings>) => {
		return new GardenPageCompiler(
			// TODO add jest-mock-creator
			{} as Vault,
			{
				pathRewriteRules: "",
				...settings,
			} as DigitalGardenSettings,
			{} as MetadataCache,
			jest.fn(),
		);
	};

	describe("generateTransclusionHeader", () => {
		it("should replace {{title}} with the basename of the file", () => {
			const testCompiler = getTestCompiler({});
			const EXPECTED_TITLE = "expected";

			const result = testCompiler.generateTransclusionHeader(
				"# {{title}}",
				{ basename: EXPECTED_TITLE } as TFile,
			);

			expect(result).toBe(`# ${EXPECTED_TITLE}`);
		});

		it("should add # to header if it is not a markdown header", () => {
			const testCompiler = getTestCompiler({});

			const result = testCompiler.generateTransclusionHeader(
				"header",
				{} as TFile,
			);

			expect(result).toBe(`# header`);
		});

		it("Ensures that header has space after #", () => {
			const testCompiler = getTestCompiler({});

			const result = testCompiler.generateTransclusionHeader(
				"###header",
				{} as TFile,
			);

			expect(result).toBe(`### header`);
		});

		it("Returns undefined if heading is undefined", () => {
			const testCompiler = getTestCompiler({});

			const result = testCompiler.generateTransclusionHeader(
				undefined,
				{} as TFile,
			);

			expect(result).toBe(undefined);
		});
	});

	describe("convertLinksToFullPath", () => {
		const mockPublishFile = {
			getPath: () => "folder/test.md",
		} as unknown as PublishFile;

		it("should convert same-file header link [[#Header]] with full file path", async () => {
			const testCompiler = getTestCompiler({});

			const result = await testCompiler.convertLinksToFullPath(
				mockPublishFile,
			)("Some text with [[#My Header]] in it");

			expect(result).toBe(
				"Some text with [[folder/test#My Header\\|#My Header]] in it",
			);
		});

		it("should convert same-file header link with display text [[#Header|display]]", async () => {
			const testCompiler = getTestCompiler({});

			const result = await testCompiler.convertLinksToFullPath(
				mockPublishFile,
			)("Link with [[#My Header|custom display]] text");

			expect(result).toBe(
				"Link with [[folder/test#My Header\\|custom display]] text",
			);
		});
	});

	describe("convertEmbeddedAssets", () => {
		const getCompilerWithImageFile = () => {
			return new GardenPageCompiler(
				{} as Vault,
				{ pathRewriteRules: "" } as DigitalGardenSettings,
				{
					getFirstLinkpathDest: jest.fn(() => ({
						path: "A Assets/travolta.png",
						extension: "png",
					})),
				} as unknown as MetadataCache,
				jest.fn(),
			);
		};

		const publishFile = {
			getPath: () => "B Bases/Books/B1 Book.md",
		} as PublishFile;

		it("converts linked image wikilinks in the note body", async () => {
			const compiler = getCompilerWithImageFile();

			const [text] = await compiler.convertEmbeddedAssets(publishFile)(
				"---\n" +
					'{"dg-publish":true}\n' +
					"---\n" +
					"See [[A Assets/travolta.png]] for details.\n",
			);

			expect(text).toContain(
				"[A Assets/travolta.png](/img/user/A%20Assets/travolta.png)",
			);
		});

		it("leaves image wikilinks inside the frontmatter block untouched", async () => {
			const compiler = getCompilerWithImageFile();

			const frontmatter =
				'{"dg-publish":true,"dg-note-properties":{"cover":"[[A Assets/travolta.png]]"}}';

			const [text] = await compiler.convertEmbeddedAssets(publishFile)(
				"---\n" +
					frontmatter +
					"\n---\n" +
					"Body link [[A Assets/travolta.png]] still converts.\n",
			);

			expect(text).toContain(frontmatter);

			expect(text).toContain(
				"[A Assets/travolta.png](/img/user/A%20Assets/travolta.png)",
			);
		});
	});

	describe("getFrontmatterImageLinkpath", () => {
		it("returns plain image paths as-is", () => {
			expect(getFrontmatterImageLinkpath("attachments/cover.jpg")).toBe(
				"attachments/cover.jpg",
			);
		});

		it("unwraps wikilink image values", () => {
			expect(getFrontmatterImageLinkpath("[[cover.jpg]]")).toBe(
				"cover.jpg",
			);
		});

		it("unwraps embed wikilinks with alias", () => {
			expect(
				getFrontmatterImageLinkpath("![[A Assets/cover.png|300]]"),
			).toBe("A Assets/cover.png");
		});

		it("returns null for external URLs", () => {
			expect(
				getFrontmatterImageLinkpath("https://example.com/cover.jpg"),
			).toBe(null);
		});

		it("returns null for non-image values", () => {
			expect(getFrontmatterImageLinkpath("just a description")).toBe(
				null,
			);
			expect(getFrontmatterImageLinkpath("[[Some note]]")).toBe(null);
			expect(getFrontmatterImageLinkpath(42)).toBe(null);
			expect(getFrontmatterImageLinkpath(null)).toBe(null);
		});
	});

	describe("selectBaseView", () => {
		const baseFileText = "original base yaml";

		const parsedBase = {
			filters: 'file.inFolder("lessons")',
			properties: {
				module: {
					displayName: "Module",
				},
			},
			views: [
				{
					type: "table",
					name: "Lessons by Module",
					filters: 'file.hasProperty("module")',
				},
				{
					type: "cards",
					name: "Hardware Modules",
					filters: 'file.hasTag("hardware")',
				},
			],
		};

		let warnSpy: jest.SpyInstance;

		beforeEach(() => {
			jest.clearAllMocks();
			warnSpy = jest.spyOn(Logger, "warn").mockImplementation(() => {});
		});

		afterEach(() => {
			warnSpy.mockRestore();
		});

		it("keeps only the requested named view while preserving global configuration", () => {
			jest.mocked(parseYaml).mockReturnValue(parsedBase);
			jest.mocked(stringifyYaml).mockReturnValue("selected view yaml");

			const result = selectBaseView(baseFileText, "Hardware Modules");

			expect(parseYaml).toHaveBeenCalledWith(baseFileText);

			expect(stringifyYaml).toHaveBeenCalledWith({
				filters: parsedBase.filters,
				properties: parsedBase.properties,
				views: [parsedBase.views[1]],
			});
			expect(result).toBe("selected view yaml");
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it("returns the Base unchanged without parsing when no view is selected", () => {
			const result = selectBaseView(baseFileText, undefined);

			expect(parseYaml).not.toHaveBeenCalled();
			expect(result).toBe(baseFileText);
		});

		it("leaves the Base unchanged and warns when the requested view does not exist", () => {
			jest.mocked(parseYaml).mockReturnValue(parsedBase);

			const result = selectBaseView(baseFileText, "Missing View");

			expect(stringifyYaml).not.toHaveBeenCalled();
			expect(result).toBe(baseFileText);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Base view "Missing View" not found'),
			);
		});

		it("falls back to the full Base and warns when the YAML cannot be parsed", () => {
			jest.mocked(parseYaml).mockImplementation(() => {
				throw new Error("bad yaml");
			});

			const result = selectBaseView(baseFileText, "Hardware Modules");

			expect(result).toBe(baseFileText);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to parse"),
				expect.any(Error),
			);
		});
	});

	describe("createBaseCodeBlock", () => {
		const baseFileText = "original base yaml";

		const parsedBase = {
			views: [
				{
					type: "cards",
					name: "Hardware Modules",
					filters: 'file.hasTag("hardware")',
				},
			],
		};

		beforeEach(() => {
			jest.clearAllMocks();
		});

		it("uses the fragment in a Base embed to build a single-view code block", () => {
			jest.mocked(parseYaml).mockReturnValue(parsedBase);
			jest.mocked(stringifyYaml).mockReturnValue("selected view yaml");

			const result = createBaseCodeBlock(
				baseFileText,
				"Access-Control.base#Hardware Modules",
			);

			expect(result).toBe("\n```base\nselected view yaml\n```\n");
		});

		it("embeds the full Base without parsing when no view fragment is present", () => {
			const result = createBaseCodeBlock(
				baseFileText,
				"Access-Control.base",
			);

			expect(parseYaml).not.toHaveBeenCalled();
			expect(result).toBe("\n```base\noriginal base yaml\n```\n");
		});
	});

	describe("image regexes match escaped pipes in tables", () => {
		it("TRANSCLUDED_SVG_REGEX matches ![[image.svg\\|size]] with escaped pipe", () => {
			const input = "| ![[garden-gate.svg\\|50]] | description |";
			TRANSCLUDED_SVG_REGEX.lastIndex = 0;
			const match = TRANSCLUDED_SVG_REGEX.exec(input);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("garden-gate");
			expect(match![4]).toBe("50");
		});

		it("TRANSCLUDED_SVG_REGEX still matches ![[image.svg|size]] with normal pipe", () => {
			const input = "![[garden-gate.svg|50]]";
			TRANSCLUDED_SVG_REGEX.lastIndex = 0;
			const match = TRANSCLUDED_SVG_REGEX.exec(input);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("garden-gate");
			expect(match![4]).toBe("50");
		});

		it("TRANSCLUDED_SVG_REGEX matches ![[image.svg]] without size", () => {
			const input = "![[garden-gate.svg]]";
			TRANSCLUDED_SVG_REGEX.lastIndex = 0;
			const match = TRANSCLUDED_SVG_REGEX.exec(input);
			expect(match).not.toBeNull();
			expect(match![5]).toBe("garden-gate");
		});

		it("image regex matches ![[image.png\\|size]] with escaped pipe in table", () => {
			const regex =
				/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\\?\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\]\]/g;
			const input = "| ![[travolta.png\\|100]] | name |";
			const match = regex.exec(input);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("travolta");
			expect(match![4]).toBe("100");
		});

		it("image regex still matches ![[image.png|size]] with normal pipe", () => {
			const regex =
				/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\\?\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\]\]/g;
			const input = "![[travolta.png|100]]";
			const match = regex.exec(input);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("travolta");
			expect(match![4]).toBe("100");
		});

		it("split with escaped pipe extracts image name and size correctly", () => {
			const tableImageRef = "travolta.png\\|100";
			const [name, size] = tableImageRef.split(/\\?\|/);
			expect(name).toBe("travolta.png");
			expect(size).toBe("100");
		});

		it("split with normal pipe still works", () => {
			const imageRef = "travolta.png|100";
			const [name, size] = imageRef.split(/\\?\|/);
			expect(name).toBe("travolta.png");
			expect(size).toBe("100");
		});
	});
});
