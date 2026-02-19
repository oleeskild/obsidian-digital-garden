import { MetadataCache, TFile, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { GardenPageCompiler } from "./GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";

// Mock obsidian module with getLinkpath
jest.mock("obsidian", () => ({
	getLinkpath: jest.fn((link: string) => {
		// Extract filename from wikilink, handling headers
		const hashIndex = link.indexOf("#");

		if (hashIndex !== -1) {
			return link.substring(0, hashIndex);
		}

		return link;
	}),
}));

// Obsidian adds custom methods to String prototype
declare global {
	interface String {
		contains(searchString: string): boolean;
	}
}

if (!String.prototype.contains) {
	String.prototype.contains = function (searchString: string): boolean {
		return this.includes(searchString);
	};
}

describe("GardenPageCompiler", () => {
	describe("convertLinksToFullPath", () => {
		const createMockSettings = (
			overrides: Partial<DigitalGardenSettings> = {},
		): DigitalGardenSettings => {
			return {
				pathRewriteRules: "",
				slugifyEnabled: false,
				...overrides,
			} as DigitalGardenSettings;
		};

		const createCompiler = (
			metadataCacheMock: Partial<MetadataCache> = {},
		) => {
			return new GardenPageCompiler(
				{} as Vault,
				createMockSettings(),
				{
					getFirstLinkpathDest: jest.fn(),
					...metadataCacheMock,
				} as unknown as MetadataCache,
				jest.fn(),
			);
		};

		const createMockPublishFile = (path: string): PublishFile => {
			return {
				getPath: () => path,
				meta: {
					getCreatedAt: () => undefined,
					getUpdatedAt: () => undefined,
				},
			} as unknown as PublishFile;
		};

		it("should output wikilinks with unescaped pipe for site template compatibility", async () => {
			// The site template (eleventy) splits wikilinks on "|" to extract
			// the display name. Using escaped "\|" breaks this functionality.
			//
			// Site template code:
			//   const [fileLink, linkTitle] = p1.split("|");
			//
			// This test ensures wikilinks use plain "|" not "\|"

			const mockLinkedFile = {
				path: "folder/Target Note.md",
				extension: "md",
			} as TFile;

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(mockLinkedFile),
			});

			const mockFile = createMockPublishFile("source/note.md");

			const inputText =
				"Check out [[Target Note|My Alias]] for more info.";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// The output should use plain pipe, not escaped pipe
			expect(result).toContain("[[folder/Target Note|My Alias]]");
			expect(result).not.toContain("\\|");
		});

		it("should preserve wikilink structure when file is not found", async () => {
			// When a linked file doesn't exist, the compiler should still
			// output a valid wikilink format that the site template can parse

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(null),
			});

			const mockFile = createMockPublishFile("source/note.md");
			const inputText = "See [[Missing Note|Display Text]] for details.";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// Even for missing files, use plain pipe
			expect(result).toContain("|Display Text]]");
			expect(result).not.toContain("\\|");
		});

		it("should handle wikilinks with headers and aliases", async () => {
			const mockLinkedFile = {
				path: "docs/Guide.md",
				extension: "md",
			} as TFile;

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(mockLinkedFile),
			});

			const mockFile = createMockPublishFile("notes/index.md");
			const inputText = "Read [[Guide#Section|the section]] carefully.";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// Should preserve header and use plain pipe
			expect(result).toContain("[[docs/Guide#Section|the section]]");
			expect(result).not.toContain("\\|");
		});

		it("should handle canvas files correctly", async () => {
			const mockCanvasFile = {
				path: "diagrams/flowchart.canvas",
				extension: "canvas",
			} as TFile;

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(mockCanvasFile),
			});

			const mockFile = createMockPublishFile("notes/overview.md");
			const inputText = "View the [[flowchart|Flowchart Diagram]] here.";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// Canvas files should keep .canvas extension and use plain pipe
			expect(result).toContain(
				"[[diagrams/flowchart.canvas|Flowchart Diagram]]",
			);
			expect(result).not.toContain("\\|");
		});

		it("should handle wikilinks without aliases", async () => {
			const mockLinkedFile = {
				path: "articles/Simple Note.md",
				extension: "md",
			} as TFile;

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(mockLinkedFile),
			});

			const mockFile = createMockPublishFile("index.md");
			const inputText = "Check [[Simple Note]] for info.";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// Without explicit alias, the filename becomes the display name
			expect(result).toContain("[[articles/Simple Note|Simple Note]]");
			expect(result).not.toContain("\\|");
		});

		it("should produce output compatible with site template link filter", async () => {
			// This test simulates exactly what the site template does:
			// It uses a regex to find [[...|...]] and splits on "|"

			const mockLinkedFile = {
				path: "ACKS/Blightlands/Region/Ashborne County.md",
				extension: "md",
			} as TFile;

			const compiler = createCompiler({
				getFirstLinkpathDest: jest.fn().mockReturnValue(mockLinkedFile),
			});

			const mockFile = createMockPublishFile("notes/town.md");
			const inputText = "Located in [[Ashborne County|Ashborne County]].";

			const convertStep = compiler.convertLinksToFullPath(mockFile);
			const result = await convertStep(inputText);

			// Simulate site template parsing
			const linkRegex = /\[\[(.*?\|.*?)\]\]/g;
			const match = linkRegex.exec(result);

			expect(match).not.toBeNull();

			if (match) {
				const [fileLink, linkTitle] = match[1].split("|");

				expect(fileLink).toBe(
					"ACKS/Blightlands/Region/Ashborne County",
				);
				expect(linkTitle).toBe("Ashborne County");
			}
		});
	});

	describe("generateTransclusionHeader", () => {
		const getTestCompiler = (settings: Partial<DigitalGardenSettings>) => {
			return new GardenPageCompiler(
				{} as Vault,
				{
					pathRewriteRules: "",
					...settings,
				} as DigitalGardenSettings,
				{} as MetadataCache,
				jest.fn(),
			);
		};

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
});
