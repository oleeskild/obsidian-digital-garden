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
	const getTestCompiler = (
		settings: Partial<DigitalGardenSettings>,
		metadataCache = {} as MetadataCache,
	) => {
		return new GardenPageCompiler(
			// TODO add jest-mock-creator
			{} as Vault,
			{
				pathRewriteRules: "",
				...settings,
			} as DigitalGardenSettings,
			metadataCache,
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

		it("should convert same-file header links to standard Markdown", async () => {
			const testCompiler = getTestCompiler({});

			const result = await testCompiler.convertLinksToFullPath(
				mockPublishFile,
			)("Some text with [[#My Header]] in it");

			expect(result).toBe(
				"Some text with [#My Header](folder/test.md#My%20Header) in it",
			);
		});

		it("should convert same-file header link with display text [[#Header|display]]", async () => {
			const testCompiler = getTestCompiler({});

			const result = await testCompiler.convertLinksToFullPath(
				mockPublishFile,
			)("Link with [[#My Header|custom display]] text");

			expect(result).toBe(
				"Link with [custom display](folder/test.md#My%20Header) text",
			);
		});

		it("resolves note wikilinks as standard Markdown links", async () => {
			const testCompiler = getTestCompiler({}, {
				getFirstLinkpathDest: jest.fn(() => ({
					path: "Example/Test.md",
					extension: "md",
				})),
			} as unknown as MetadataCache);

			const result =
				await testCompiler.convertLinksToFullPath(mockPublishFile)(
					"[[Test.md]]",
				);

			expect(result).toBe("[Test.md](Example/Test.md)");
		});

		it("can preserve Obsidian wikilink output", async () => {
			const testCompiler = getTestCompiler({ linkFormat: "wikilink" }, {
				getFirstLinkpathDest: jest.fn(() => ({
					path: "Example/Test.md",
					extension: "md",
				})),
			} as unknown as MetadataCache);

			const result =
				await testCompiler.convertLinksToFullPath(mockPublishFile)(
					"[[Test.md]]",
				);

			expect(result).toBe("[[Example/Test\\|Test.md]]");
		});
	});

	describe("convertFrontMatter", () => {
		const publishFile = {} as PublishFile;

		it("preserves only the frontmatter authored in the note", () => {
			const compiler = getTestCompiler({});
			const source = "---\ntitle: Test\n---\nBody\n";

			const result = compiler.convertFrontMatter(publishFile)(source);

			expect(result).toBe(source);
		});

		it("does not add frontmatter when the note has none", () => {
			const compiler = getTestCompiler({});

			const result = compiler.convertFrontMatter(publishFile)("Body\n");

			expect(result).toBe("Body\n");
		});
	});

	describe("convertMarkdownLinksToFullPath", () => {
		const sourcePath = "wiki/concepts/high-impact-practices.md";

		const mockPublishFile = {
			getPath: () => sourcePath,
		} as unknown as PublishFile;

		// Resolves like Obsidian: vault files addressed by full path,
		// unique-basename lookup, or path relative to the source file.
		const vaultFiles: Record<string, string> = {
			"wiki/authors/andrade.md": "wiki/authors/andrade.md",
			"../authors/andrade.md": "wiki/authors/andrade.md",
			"feedback.md": "wiki/concepts/feedback.md",
			"wiki/concepts/feedback.md": "wiki/concepts/feedback.md",
			"My Note.md": "My Note.md",
			"board.canvas": "wiki/board.canvas",
		};

		const getCompiler = (settings: Partial<DigitalGardenSettings> = {}) => {
			return new GardenPageCompiler(
				{} as Vault,
				{ pathRewriteRules: "", ...settings } as DigitalGardenSettings,
				{
					getFirstLinkpathDest: jest.fn((linkpath: string) => {
						const path = vaultFiles[linkpath];

						if (!path) return null;

						return {
							path,
							extension: path.substring(
								path.lastIndexOf(".") + 1,
							),
						};
					}),
				} as unknown as MetadataCache,
				jest.fn(),
			);
		};

		it("converts a relative markdown link to a full-path markdown link", async () => {
			const result = await getCompiler().convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("See [Andrade](../authors/andrade.md) for details");

			expect(result).toBe(
				"See [Andrade](wiki/authors/andrade.md) for details",
			);
		});

		it("converts a shortest-path markdown link via vault lookup", async () => {
			const result = await getCompiler().convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("See [Feedback](feedback.md)");

			expect(result).toBe("See [Feedback](wiki/concepts/feedback.md)");
		});

		it("preserves and decodes header fragments", async () => {
			const result = await getCompiler().convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("[Model](feedback.md#The%20Model)");

			expect(result).toBe(
				"[Model](wiki/concepts/feedback.md#The%20Model)",
			);
		});

		it("decodes URL-encoded link targets", async () => {
			const result = await getCompiler().convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("[Note](My%20Note.md)");

			expect(result).toBe("[Note](My%20Note.md)");
		});

		it("keeps the .canvas extension for canvas links", async () => {
			const result = await getCompiler().convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("[Board](board.canvas)");

			expect(result).toBe("[Board](wiki/board.canvas)");
		});

		it("resolves explicit relative paths even when the raw target has no vault match", async () => {
			const compiler = new GardenPageCompiler(
				{} as Vault,
				{ pathRewriteRules: "" } as DigitalGardenSettings,
				{
					// Only resolves normalized vault-root paths, like a vault
					// where getFirstLinkpathDest does not understand "../".
					getFirstLinkpathDest: jest.fn((linkpath: string) =>
						linkpath === "wiki/authors/andrade.md"
							? {
									path: "wiki/authors/andrade.md",
									extension: "md",
							  }
							: null,
					),
				} as unknown as MetadataCache,
				jest.fn(),
			);

			const result = await compiler.convertMarkdownLinksToFullPath(
				mockPublishFile,
			)("[Andrade](../authors/andrade.md)");

			expect(result).toBe("[Andrade](wiki/authors/andrade.md)");
		});

		it("uses wikilinks when configured", async () => {
			const result = await getCompiler({
				linkFormat: "wikilink",
			}).convertMarkdownLinksToFullPath(mockPublishFile)(
				"[Andrade](../authors/andrade.md)",
			);

			expect(result).toBe("[[wiki/authors/andrade\\|Andrade]]");
		});

		it("leaves external links untouched", async () => {
			const text =
				"[ext](https://example.com/a.md) [mail](mailto:a@b.md)";

			const result =
				await getCompiler().convertMarkdownLinksToFullPath(
					mockPublishFile,
				)(text);

			expect(result).toBe(text);
		});

		it("leaves unresolved links untouched", async () => {
			const text = "[missing](does/not/exist.md)";

			const result =
				await getCompiler().convertMarkdownLinksToFullPath(
					mockPublishFile,
				)(text);

			expect(result).toBe(text);
		});

		it("leaves image embeds untouched", async () => {
			const text = "![embed](../authors/andrade.md)";

			const result =
				await getCompiler().convertMarkdownLinksToFullPath(
					mockPublishFile,
				)(text);

			expect(result).toBe(text);
		});

		it("leaves links inside code fences untouched", async () => {
			const text = "```\n[Andrade](../authors/andrade.md)\n```";

			const result =
				await getCompiler().convertMarkdownLinksToFullPath(
					mockPublishFile,
				)(text);

			expect(result).toBe(text);
		});

		it("does not touch non-md/canvas file links", async () => {
			const text = "[doc](files/report.pdf)";

			const result =
				await getCompiler().convertMarkdownLinksToFullPath(
					mockPublishFile,
				)(text);

			expect(result).toBe(text);
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

	describe("extractImageLinks", () => {
		const getCompilerWithFrontmatter = (
			frontmatter: Record<string, unknown>,
		) => {
			return new GardenPageCompiler(
				{} as Vault,
				{ pathRewriteRules: "" } as DigitalGardenSettings,
				{
					getFirstLinkpathDest: jest.fn((linkpath: string) => ({
						path: linkpath,
						extension: linkpath.split(".").pop(),
					})),
					getFileCache: jest.fn(() => ({ frontmatter })),
				} as unknown as MetadataCache,
				jest.fn(),
			);
		};

		const getPublishFile = (rawText: string) =>
			({
				file: {} as TFile,
				getPath: () => "B Bases/Books/B2 Book.md",
				cachedRead: async () => rawText,
			}) as unknown as PublishFile;

		it("includes plain-path frontmatter cover images", async () => {
			const compiler = getCompilerWithFrontmatter({
				"dg-publish": true,
				cover: "A Assets/travolta.webp",
			});

			const assets = await compiler.extractImageLinks(
				getPublishFile(
					"---\ndg-publish: true\ncover: A Assets/travolta.webp\n---\nBody text.\n",
				),
			);

			expect(assets).toContain("A Assets/travolta.webp");
		});

		it("includes wikilink frontmatter cover images", async () => {
			const compiler = getCompilerWithFrontmatter({
				"dg-publish": true,
				cover: "[[A Assets/travolta.png]]",
			});

			const assets = await compiler.extractImageLinks(
				getPublishFile(
					'---\ndg-publish: true\ncover: "[[A Assets/travolta.png]]"\n---\nBody text.\n',
				),
			);

			expect(assets).toContain("A Assets/travolta.png");
		});

		it("includes covers listed in array frontmatter properties", async () => {
			const compiler = getCompilerWithFrontmatter({
				"dg-publish": true,
				covers: ["A Assets/one.png", "[[A Assets/two.jpg]]"],
			});

			const assets = await compiler.extractImageLinks(
				getPublishFile("---\ndg-publish: true\n---\nBody text.\n"),
			);

			expect(assets).toContain("A Assets/one.png");
			expect(assets).toContain("A Assets/two.jpg");
		});

		it("ignores external URL and non-image frontmatter values", async () => {
			const compiler = getCompilerWithFrontmatter({
				"dg-publish": true,
				cover: "https://example.com/cover.jpg",
				description: "just text",
			});

			const assets = await compiler.extractImageLinks(
				getPublishFile("---\ndg-publish: true\n---\nBody text.\n"),
			);

			expect(assets).toEqual([]);
		});

		it("still extracts body image embeds", async () => {
			const compiler = getCompilerWithFrontmatter({
				"dg-publish": true,
			});

			const assets = await compiler.extractImageLinks(
				getPublishFile(
					"---\ndg-publish: true\n---\n![[A Assets/travolta.png]]\n",
				),
			);

			expect(assets).toContain("A Assets/travolta.png");
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
