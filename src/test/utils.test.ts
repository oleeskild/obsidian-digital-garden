import assert from "node:assert";
import {
	generateBlobHashFromBase64,
	getGardenPathForNote,
	getRewriteRules,
	wrapAround,
} from "../utils/utils";
import { PathRewriteRules } from "../repositoryConnection/DigitalGardenSiteManager";

describe("utils", () => {
	describe("getGardenPathForNote", () => {
		const TESTS: Array<{
			name: string;
			input: { gardenPath: string; rules: PathRewriteRules };
			expected: string;
		}> = [
			{
				name: "replaces a path according to rules",
				input: {
					gardenPath: "defaultGardenPath/notes/note.md",
					rules: [{ from: "defaultGardenPath", to: "gardenPath" }],
				},
				expected: "gardenPath/notes/note.md",
			},
			{
				name: "replaces a path according to the first rule found",
				input: {
					gardenPath: "defaultGardenPath/notes/note.md",
					rules: [
						{
							from: "defaultGardenPath",
							to: "gardenPath",
						},
						{
							from: "defaultGardenPath/notes",
							to: "gargamel",
						},
					],
				},
				expected: "gardenPath/notes/note.md",
			},
		];

		for (const test of TESTS) {
			it(test.name, () => {
				assert.strictEqual(
					getGardenPathForNote(
						test.input.gardenPath,
						test.input.rules,
					),
					test.expected,
				);
			});
		}

		it("handles rewrites to base path correctly", () => {
			const rewriteRules: PathRewriteRules = [
				{ from: "defaultGardenPath", to: "" },
			];
			const gardenPath = "defaultGardenPath/notes/note.md";

			const result = getGardenPathForNote(gardenPath, rewriteRules);

			expect(result).toBe("notes/note.md");
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
				input: "defaultGardenPath:gardenPath",
				expected: [{ from: "defaultGardenPath", to: "gardenPath" }],
			},
			{
				name: "parses multiple rewrite rules",
				input: "defaultGardenPath:gardenPath\ndefaultGardenPath/notes:gargamel",
				expected: [
					{
						from: "defaultGardenPath",
						to: "gardenPath",
					},
					{
						from: "defaultGardenPath/notes",
						to: "gargamel",
					},
				],
			},
			{
				name: "skips lines without a colon",
				input: "defaultGardenPath:gardenPath\nnoColon",
				expected: [{ from: "defaultGardenPath", to: "gardenPath" }],
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

	describe("generateBlobHashFromBase64", () => {
		it("returns a 40-character hex string (SHA1 format)", () => {
			// "Hello World" in base64
			const base64Content = "SGVsbG8gV29ybGQ=";
			const hash = generateBlobHashFromBase64(base64Content);

			expect(hash).toMatch(/^[a-f0-9]{40}$/);
		});

		it("produces consistent hashes for identical content", () => {
			const base64Content = "SGVsbG8gV29ybGQ=";
			const hash1 = generateBlobHashFromBase64(base64Content);
			const hash2 = generateBlobHashFromBase64(base64Content);

			expect(hash1).toBe(hash2);
		});

		it("produces different hashes for different content", () => {
			const content1 = "SGVsbG8gV29ybGQ="; // "Hello World"
			const content2 = "R29vZGJ5ZSBXb3JsZA=="; // "Goodbye World"
			const hash1 = generateBlobHashFromBase64(content1);
			const hash2 = generateBlobHashFromBase64(content2);

			expect(hash1).not.toBe(hash2);
		});

		it("matches Git blob hash format for known content", () => {
			// "Hello World" (11 bytes) should produce Git blob hash
			// Git computes: SHA1("blob 11\0Hello World")
			const base64Content = "SGVsbG8gV29ybGQ=";
			const hash = generateBlobHashFromBase64(base64Content);

			// This hash has been verified to match GitHub's blob hashes in practice
			expect(hash).toBe("5e1c309dae7f45e0f39b1bf3ac3cd9db12e7d689");
		});
	});
});
