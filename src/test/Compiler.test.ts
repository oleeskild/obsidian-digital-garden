import { MetadataCache, TFile, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { GardenPageCompiler } from "../compiler/GardenPageCompiler";

jest.mock("obsidian");

describe("Compiler", () => {
	describe("generateTransclusionHeader", () => {
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
