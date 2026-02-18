import { MetadataCache, TFile, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { GardenPageCompiler } from "../compiler/GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";

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
});
