import assert from "node:assert";
import { getGardenPathForNote, getRewriteRules, wrapAround } from "../utils";
import { PathRewriteRules } from "../DigitalGardenSiteManager";

describe("utils", () => {
	describe("getGardenPathForNote", () => {

		const TESTS: Array<{ name: string, input: { gardenPath: string, rules: PathRewriteRules }, expected: string }> = [
			{
				name: "replaces a path according to rules",
				input: {
					gardenPath: "defaultGardenPath/notes/note.md", rules: [{ from: "defaultGardenPath", to: "gardenPath" }]
				},
				expected: "gardenPath/notes/note.md"
			},
			{
				name: "replaces a path according to the first rule found",
				input: {
					gardenPath: "defaultGardenPath/notes/note.md", rules: [{
						from: "defaultGardenPath", to: "gardenPath"
					}, {
						from: "defaultGardenPath/notes", to: "gargamel"
					}]
				},
				expected: "gardenPath/notes/note.md"
			}
		]

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(getGardenPathForNote(test.input.gardenPath, test.input.rules), test.expected);
			});
		}

		it("handles rewrites to base path correctly", () => {
			const rewriteRules: PathRewriteRules = [{ from: "defaultGardenPath", to: "" }]
			const gardenPath = "defaultGardenPath/notes/note.md";

			const result = getGardenPathForNote(gardenPath, rewriteRules);

			expect(result).toBe("notes/note.md");
		})

	});

	describe("getRewriteRules", () => {
		const TESTS: Array<{ name: string, input: string, expected: PathRewriteRules }> = [
			{
				name: "returns an empty array when no rules are provided",
				input: "",
				expected: []
			},
			{
				name: "parses a single rewrite rule",
				input: "defaultGardenPath:gardenPath",
				expected: [{ from: "defaultGardenPath", to: "gardenPath" }]
			},
			{
				name: "parses multiple rewrite rules",
				input: "defaultGardenPath:gardenPath\ndefaultGardenPath/notes:gargamel",
				expected: [{
					from: "defaultGardenPath", to: "gardenPath"
				}, {
					from: "defaultGardenPath/notes", to: "gargamel"
				}]

			},
			{
				name: "skips lines without a colon",
				input: "defaultGardenPath:gardenPath\nnoColon",
				expected: [{ from: "defaultGardenPath", to: "gardenPath" }]
			}
		]

		for (const test of TESTS) {
			it(test.name, () => {
				assert.deepStrictEqual(getRewriteRules(test.input), test.expected);
			});
		}

	})

	describe("wrapAround", () => {
		it("wraps around a positive number", () => {
			assert.strictEqual(wrapAround(5, 2), 1);
		})

	})
});
