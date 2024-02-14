import assert from "node:assert";
import {
	getSyncerPathForNote,
	getRewriteRules,
	wrapAround,
} from "../utils/utils";
import { PathRewriteRules } from "../repositoryConnection/QuartzSyncerSiteManager";

describe("utils", () => {
	describe("getSyncerPathForNote", () => {
		const TESTS: Array<{
			name: string;
			input: { gardenPath: string; rules: PathRewriteRules };
			expected: string;
		}> = [
			{
				name: "replaces a path according to rules",
				input: {
					gardenPath: "defaultSyncerPath/content/note.md",
					rules: [{ from: "defaultSyncerPath", to: "gardenPath" }],
				},
				expected: "gardenPath/content/note.md",
			},
			{
				name: "replaces a path according to the first rule found",
				input: {
					gardenPath: "defaultSyncerPath/content/note.md",
					rules: [
						{
							from: "defaultSyncerPath",
							to: "gardenPath",
						},
						{
							from: "defaultSyncerPath/content",
							to: "gargamel",
						},
					],
				},
				expected: "gardenPath/content/note.md",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					getSyncerPathForNote(
						test.input.gardenPath,
						test.input.rules,
					),
					test.expected,
				);
			});
		}

		it("handles rewrites to base path correctly", () => {
			const rewriteRules: PathRewriteRules = [
				{ from: "defaultSyncerPath", to: "" },
			];
			const gardenPath = "defaultSyncerPath/content/note.md";

			const result = getSyncerPathForNote(gardenPath, rewriteRules);

			expect(result).toBe("content/note.md");
		});
	});

	describe("getRewriteRules", () => {
		const TESTS: Array<{
			name: string;
			input: string;
			expected: PathRewriteRules;
		}> = [
			{
				name: "returns an empty array when no rules are provided",
				input: "",
				expected: [],
			},
			{
				name: "parses a single rewrite rule",
				input: "defaultSyncerPath:gardenPath",
				expected: [{ from: "defaultSyncerPath", to: "gardenPath" }],
			},
			{
				name: "parses multiple rewrite rules",
				input: "defaultSyncerPath:gardenPath\ndefaultSyncerPath/content:gargamel",
				expected: [
					{
						from: "defaultSyncerPath",
						to: "gardenPath",
					},
					{
						from: "defaultSyncerPath/content",
						to: "gargamel",
					},
				],
			},
			{
				name: "skips lines without a colon",
				input: "defaultSyncerPath:gardenPath\nnoColon",
				expected: [{ from: "defaultSyncerPath", to: "gardenPath" }],
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
