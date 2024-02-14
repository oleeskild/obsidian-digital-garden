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
			input: { quartzPath: string; rules: PathRewriteRules };
			expected: string;
		}> = [
			{
				name: "replaces a path according to rules",
				input: {
					quartzPath: "defaultSyncerPath/content/note.md",
					rules: [{ from: "defaultSyncerPath", to: "quartzPath" }],
				},
				expected: "quartzPath/content/note.md",
			},
			{
				name: "replaces a path according to the first rule found",
				input: {
					quartzPath: "defaultSyncerPath/content/note.md",
					rules: [
						{
							from: "defaultSyncerPath",
							to: "quartzPath",
						},
						{
							from: "defaultSyncerPath/content",
							to: "gargamel",
						},
					],
				},
				expected: "quartzPath/content/note.md",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					getSyncerPathForNote(
						test.input.quartzPath,
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
			const quartzPath = "defaultSyncerPath/content/note.md";

			const result = getSyncerPathForNote(quartzPath, rewriteRules);

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
				input: "defaultSyncerPath:quartzPath",
				expected: [{ from: "defaultSyncerPath", to: "quartzPath" }],
			},
			{
				name: "parses multiple rewrite rules",
				input: "defaultSyncerPath:quartzPath\ndefaultSyncerPath/content:gargamel",
				expected: [
					{
						from: "defaultSyncerPath",
						to: "quartzPath",
					},
					{
						from: "defaultSyncerPath/content",
						to: "gargamel",
					},
				],
			},
			{
				name: "skips lines without a colon",
				input: "defaultSyncerPath:quartzPath\nnoColon",
				expected: [{ from: "defaultSyncerPath", to: "quartzPath" }],
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
