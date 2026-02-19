import { FrontMatterCache } from "obsidian";
import { FrontmatterCompiler } from "./FrontmatterCompiler";
import DigitalGardenSettings from "../models/settings";
import { PublishFile } from "../publishFile/PublishFile";

jest.mock("obsidian");

// Obsidian adds custom methods to String prototype
// We need to polyfill these for tests
declare global {
	interface String {
		contains(searchString: string): boolean;
	}
}

if (!String.prototype.contains) {
	String.prototype.contains = function (searchString: string): boolean {
		return this.includes(searchString);
	};
}

describe("FrontmatterCompiler", () => {
	const createMockSettings = (
		overrides: Partial<DigitalGardenSettings> = {},
	): DigitalGardenSettings => {
		return {
			pathRewriteRules: "",
			slugifyEnabled: false,
			noteIconKey: "note-icon",
			defaultNoteIcon: "",
			showNoteIconOnTitle: false,
			showNoteIconInFileTree: false,
			showNoteIconOnInternalLink: false,
			showNoteIconOnBackLink: false,
			showCreatedTimestamp: false,
			showUpdatedTimestamp: false,
			contentClassesKey: "",
			defaultNoteSettings: {
				dgHomeLink: false,
				dgPassFrontmatter: false,
				dgShowBacklinks: false,
				dgShowLocalGraph: false,
				dgShowInlineTitle: false,
				dgShowFileTree: false,
				dgEnableSearch: false,
				dgShowToc: false,
				dgLinkPreview: false,
				dgShowTags: false,
			},
			...overrides,
		} as DigitalGardenSettings;
	};

	const createMockPublishFile = (path: string): PublishFile => {
		return {
			getPath: () => path,
			meta: {
				getCreatedAt: () => undefined,
				getUpdatedAt: () => undefined,
			},
		} as unknown as PublishFile;
	};

	/**
	 * Checks if the YAML content contains invalid escape sequences.
	 * In YAML/JSON double-quoted strings, \| is not a valid escape sequence.
	 * This causes YAML parsers (like js-yaml used by Eleventy) to fail.
	 */
	const hasInvalidYamlEscapeSequence = (yamlContent: string): boolean => {
		// Check for \| which is an invalid escape sequence in YAML/JSON
		// The backslash-pipe pattern appears as \\| in the raw string
		return yamlContent.includes("\\|");
	};

	describe("compile", () => {
		it("should produce valid YAML when frontmatter contains wikilinks with pipe aliases", () => {
			// This test verifies the bug fix for wikilinks with pipes in frontmatter.
			// When dgPassFrontmatter is enabled and frontmatter contains wikilinks
			// like [[path|alias]], the compiled output must be valid YAML.
			//
			// The bug: wikilinks get expanded to [[full/path\|alias]] where \| is
			// used to escape the pipe. When this is JSON.stringify'd and wrapped
			// in YAML delimiters, \| becomes an invalid YAML escape sequence.

			const settings = createMockSettings({
				defaultNoteSettings: {
					dgHomeLink: false,
					dgPassFrontmatter: true,
					dgShowBacklinks: false,
					dgShowLocalGraph: false,
					dgShowInlineTitle: false,
					dgShowFileTree: false,
					dgEnableSearch: false,
					dgShowToc: false,
					dgLinkPreview: false,
					dgShowTags: false,
				},
			});

			const compiler = new FrontmatterCompiler(settings);
			const mockFile = createMockPublishFile("test/note.md");

			// Simulate frontmatter with wikilinks containing pipe aliases
			// This is what the content looks like AFTER convertLinksToFullPath runs
			// With the fix, pipes are NOT escaped (using | not \|)
			const frontmatterWithWikilinks: FrontMatterCache = {
				"dg-publish": true,
				county: "[[ACKS/Blightlands/Region/Ashborne County|Ashborne County]]",
				duchy: "[[Duchy of Killifern]]",
				position: { start: { line: 0 }, end: { line: 5 } },
			} as unknown as FrontMatterCache;

			const result = compiler.compile(mockFile, frontmatterWithWikilinks);

			// The output should be wrapped in YAML delimiters
			expect(result).toMatch(/^---\n/);
			expect(result).toMatch(/\n---\n$/);

			// Extract the content between the YAML delimiters
			const yamlContent = result.slice(4, -5);

			// CRITICAL: The output must not contain \| as an escape sequence
			expect(hasInvalidYamlEscapeSequence(yamlContent)).toBe(false);
		});

		it("should handle frontmatter with simple wikilinks (no pipe alias)", () => {
			const settings = createMockSettings({
				defaultNoteSettings: {
					dgHomeLink: false,
					dgPassFrontmatter: true,
					dgShowBacklinks: false,
					dgShowLocalGraph: false,
					dgShowInlineTitle: false,
					dgShowFileTree: false,
					dgEnableSearch: false,
					dgShowToc: false,
					dgLinkPreview: false,
					dgShowTags: false,
				},
			});

			const compiler = new FrontmatterCompiler(settings);
			const mockFile = createMockPublishFile("test/note.md");

			const frontmatter: FrontMatterCache = {
				"dg-publish": true,
				related: "[[Some Other Note]]",
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache;

			const result = compiler.compile(mockFile, frontmatter);

			expect(result).toMatch(/^---\n/);
			expect(result).toMatch(/\n---\n$/);

			// Simple wikilinks should pass through without issues
			expect(result).toContain("Some Other Note");

			// Should not have any invalid escape sequences
			const yamlContent = result.slice(4, -5);
			expect(hasInvalidYamlEscapeSequence(yamlContent)).toBe(false);
		});

		it("should preserve wikilink content while producing valid YAML", () => {
			// Verifies that the wikilink display name is preserved in the output
			// while ensuring the output is valid YAML

			const settings = createMockSettings({
				defaultNoteSettings: {
					dgHomeLink: false,
					dgPassFrontmatter: true,
					dgShowBacklinks: false,
					dgShowLocalGraph: false,
					dgShowInlineTitle: false,
					dgShowFileTree: false,
					dgEnableSearch: false,
					dgShowToc: false,
					dgLinkPreview: false,
					dgShowTags: false,
				},
			});

			const compiler = new FrontmatterCompiler(settings);
			const mockFile = createMockPublishFile("test/note.md");

			const frontmatter: FrontMatterCache = {
				"dg-publish": true,
				link: "[[Some/Path/To/Note|Display Name]]",
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache;

			const result = compiler.compile(mockFile, frontmatter);

			// The display name should be preserved
			expect(result).toContain("Display Name");
			expect(result).toContain("Some/Path/To/Note");

			// But it must be valid YAML (no invalid escape sequences)
			const yamlContent = result.slice(4, -5);
			expect(hasInvalidYamlEscapeSequence(yamlContent)).toBe(false);
		});
	});
});
