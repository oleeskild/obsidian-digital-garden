import assert from "node:assert";
import { getGardenPathForNote, getRewriteRules, wrapAround } from "../utils";

describe("utils", () => {
	describe("getGardenPathForNote", () => {

		const TESTS = [
			{
				name: "replaces a path according to rules",
				input: { gardenPath: "defaultGardenPath/notes/note.md", rules: [["defaultGardenPath", "gardenPath"]] },
				expected: "gardenPath/notes/note.md"
			},
			{
				name: "replaces a path according to the first rule found",
				input: { gardenPath: "defaultGardenPath/notes/note.md", rules: [["defaultGardenPath", "gardenPath"], ["defaultGardenPath/notes", "gargamel"]] },
				expected: "gardenPath/notes/note.md"
			}
		]

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(getGardenPathForNote(test.input.gardenPath, test.input.rules), test.expected);
			});
		}

		// https://github.com/oleeskild/obsidian-digital-garden/issues/289
		it.skip("handles rewrites to base path correctly", () => {
			const rewriteRules = [["defaultGardenPath", ""]];
			const gardenPath = "defaultGardenPath/notes/note.md";

			const result = getGardenPathForNote(gardenPath, rewriteRules);

			expect(result).toBe("notes/note.md");
		})

	});

	describe("getRewriteRules", () => {
		const TESTS = [
			{
				name: "returns an empty array when no rules are provided",
				input: "",
				expected: []
			},
			{
				name: "parses a single rewrite rule",
				input: "defaultGardenPath:gardenPath",
				expected: [["defaultGardenPath", "gardenPath"]]
			},
			{
				name: "parses multiple rewrite rules",
				input: "defaultGardenPath:gardenPath\ndefaultGardenPath/notes:gargamel",
				expected: [["defaultGardenPath", "gardenPath"], ["defaultGardenPath/notes", "gargamel"]]
			},
			{
				name: "skips lines without a colon",
				input: "defaultGardenPath:gardenPath\nnoColon",
				expected: [["defaultGardenPath", "gardenPath"]]
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
