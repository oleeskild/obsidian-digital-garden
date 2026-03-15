import { MetadataCache, TFile, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { GardenPageCompiler } from "../compiler/GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";
import { TRANSCLUDED_SVG_REGEX } from "../utils/regexes";

jest.mock("obsidian");

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
