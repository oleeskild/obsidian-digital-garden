import DigitalGardenSettings from "../DigitalGardenSettings";
import Publisher from "../Publisher";
jest.mock("obsidian");

describe("Publisher", () => {
	describe("generateTransclusionHeader", () => {
		const getTestPublisher = (settings: Partial<DigitalGardenSettings>) => {
			return new Publisher(
				{} as any,
				{} as any,
				{ pathRewriteRules: "", ...settings } as DigitalGardenSettings,
			);
		};

		it("should replace {{title}} with the basename of the file", () => {
			const testPublisher = getTestPublisher({});
			const EXPECTED_TITLE = "expected";
			const result = testPublisher.generateTransclusionHeader(
				"# {{header}}",
				{ basename: EXPECTED_TITLE } as any,
			);

			expect(result).toBe(`# ${EXPECTED_TITLE}`);
		});
		it("should add # to header if it is not a markdown header", () => {
			const testPublisher = getTestPublisher({});
			const result = testPublisher.generateTransclusionHeader(
				"header",
				{} as any,
			);

			expect(result).toBe(`# header`);
		});
		it("Ensures that header has space after #", () => {
			const testPublisher = getTestPublisher({});
			const result = testPublisher.generateTransclusionHeader(
				"###header",
				{} as any,
			);

			expect(result).toBe(`### header`);
		});
		it("Returns undefined if heading is undefined", () => {
			const testPublisher = getTestPublisher({});
			const result = testPublisher.generateTransclusionHeader(
				undefined,
				{} as any,
			);

			expect(result).toBe(undefined);
		});
	});
});
