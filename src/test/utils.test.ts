import assert from "node:assert";
import {
	getSyncerPathForNote,
	getRewriteRules,
	wrapAround,
} from "../utils/utils";
import { PathRewriteRule } from "../repositoryConnection/QuartzSyncerSiteManager";

describe("utils", () => {
	describe("getSyncerPathForNote", () => {
		const TESTS: Array<{
			name: string;
			input: { quartzPath: string; rule: PathRewriteRule };
			expected: string;
		}> = [
			{
				name: "replaces a path according to rules",
				input: {
					quartzPath: "defaultSyncerPath/content/note.md",
					rule: { from: "defaultSyncerPath", to: "quartzPath" },
				},
				expected: "quartzPath/content/note.md",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					getSyncerPathForNote(
						test.input.quartzPath,
						test.input.rule,
					),
					test.expected,
				);
			});
		}

		it("handles rewrites to base path correctly", () => {
			const rewriteRule: PathRewriteRule = {
				from: "defaultSyncerPath",
				to: "",
			};
			const quartzPath = "defaultSyncerPath/content/note.md";

			const result = getSyncerPathForNote(quartzPath, rewriteRule);

			expect(result).toBe("content/note.md");
		});
	});

	describe("getRewriteRules", () => {
		const TESTS: Array<{
			name: string;
			input: string;
			expected: PathRewriteRule;
		}> = [
			{
				name: "returns an empty array when no rules are provided",
				input: "",
				expected: { from: "", to: "/" },
			},
			{
				name: "parses a single rewrite rule",
				input: "defaultSyncerPath",
				expected: { from: "defaultSyncerPath", to: "/" },
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.deepStrictEqual(
					getRewriteRules(test.input),
					test.expected,
				);
			});
		}
	});

	describe("wrapAround", () => {
		it("wraps around a positive number", () => {
			assert.strictEqual(wrapAround(5, 2), 1);
		});
	});
});
