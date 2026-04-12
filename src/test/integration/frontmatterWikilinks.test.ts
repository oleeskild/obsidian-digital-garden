import * as fs from "fs";
import * as path from "path";
import { FrontMatterCache, MetadataCache, TFile, Vault } from "obsidian";
import { GardenPageCompiler } from "../../compiler/GardenPageCompiler";
import { FrontmatterCompiler } from "../../compiler/FrontmatterCompiler";
import DigitalGardenSettings from "../../models/settings";
import { PublishFile } from "../../publishFile/PublishFile";

// Mock obsidian module
jest.mock("obsidian", () => ({
	getLinkpath: jest.fn((link: string) => {
		const hashIndex = link.indexOf("#");

		if (hashIndex !== -1) {
			return link.substring(0, hashIndex);
		}

		return link;
	}),
}));

// Polyfill Obsidian's String.contains
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

describe("Integration: Frontmatter wikilinks", () => {
	const TEST_VAULT_PATH = path.join(__dirname, "../../dg-testVault");

	// Simulated file database for the test vault
	const testVaultFiles: Record<string, { path: string; extension: string }> =
		{
			"000 Home": { path: "000 Home.md", extension: "md" },
			"001 Links": { path: "001 Links.md", extension: "md" },
			"002 Hidden page": { path: "002 Hidden page.md", extension: "md" },
		};

	const createMockSettings = (): DigitalGardenSettings => {
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
			customFilters: [],
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
		} as unknown as DigitalGardenSettings;
	};

	const createMockMetadataCache = (): MetadataCache => {
		return {
			getFirstLinkpathDest: jest.fn((linkPath: string) => {
				const file = testVaultFiles[linkPath];

				if (file) {
					return {
						path: file.path,
						extension: file.extension,
					} as TFile;
				}

				return null;
			}),
			getCache: jest.fn(() => ({
				frontmatter: {
					"dg-publish": true,
					county: "[[000 Home]]",
					related: "[[001 Links]]",
				},
			})),
		} as unknown as MetadataCache;
	};

	it("should produce wikilinks with unescaped pipes in compiled output", async () => {
		const testFilePath = path.join(
			TEST_VAULT_PATH,
			"016 Frontmatter wikilinks.md",
		);
		const fileContent = fs.readFileSync(testFilePath, "utf-8");

		const settings = createMockSettings();
		const metadataCache = createMockMetadataCache();

		const compiler = new GardenPageCompiler(
			{} as Vault,
			settings,
			metadataCache,
			jest.fn(),
		);

		// Test the convertLinksToFullPath step directly
		const mockFile = {
			getPath: () => "016 Frontmatter wikilinks.md",
			meta: {
				getCreatedAt: () => undefined,
				getUpdatedAt: () => undefined,
			},
		} as unknown as PublishFile;

		const convertStep = compiler.convertLinksToFullPath(mockFile);
		const result = await convertStep(fileContent);

		// Verify: Body wikilinks should have plain pipes, not escaped
		expect(result).toContain("[[000 Home|");
		expect(result).not.toContain("\\|");

		// The aliased link in body should be converted properly
		expect(result).toContain("Home with alias]]");
	});

	it("should produce valid YAML when frontmatter contains expanded wikilinks", () => {
		const settings = createMockSettings();
		const frontmatterCompiler = new FrontmatterCompiler(settings);

		// Simulate frontmatter after wikilinks have been expanded (with plain pipes)
		const expandedFrontmatter = {
			"dg-publish": true,
			county: "[[000 Home|000 Home]]",
			related: "[[001 Links|001 Links]]",
			position: { start: { line: 0 }, end: { line: 5 } },
		};

		const mockFile = {
			getPath: () => "016 Frontmatter wikilinks.md",
			meta: {
				getCreatedAt: () => undefined,
				getUpdatedAt: () => undefined,
			},
		} as unknown as PublishFile;

		const result = frontmatterCompiler.compile(
			mockFile,
			expandedFrontmatter as unknown as FrontMatterCache,
		);

		// Should be wrapped in YAML delimiters
		expect(result).toMatch(/^---\n/);
		expect(result).toMatch(/\n---\n$/);

		// Should NOT contain escaped pipes
		expect(result).not.toContain("\\|");

		// Should contain the wikilink content
		expect(result).toContain("000 Home");
		expect(result).toContain("001 Links");

		// The JSON should be parseable
		const yamlContent = result.slice(4, -5);
		expect(() => JSON.parse(yamlContent)).not.toThrow();
	});

	it("reproduces the original bug scenario with county wikilink", async () => {
		// This test simulates Ryan's exact scenario:
		// - A note with county: "[[Ashborne County]]" in frontmatter
		// - The same wikilink [[Ashborne County]] appears in body
		// - After compilation, both should use plain | not \|

		const fileContent = `---
dg-publish: true
county: "[[000 Home]]"
---
**Belongs To:** [[000 Home]]
`;

		const settings = createMockSettings();
		const metadataCache = createMockMetadataCache();

		const compiler = new GardenPageCompiler(
			{} as Vault,
			settings,
			metadataCache,
			jest.fn(),
		);

		const mockFile = {
			getPath: () => "test-note.md",
			meta: {
				getCreatedAt: () => undefined,
				getUpdatedAt: () => undefined,
			},
		} as unknown as PublishFile;

		const convertStep = compiler.convertLinksToFullPath(mockFile);
		const result = await convertStep(fileContent);

		// The converted text should NOT have escaped pipes anywhere
		expect(result).not.toContain("\\|");

		// But should have the wikilink with alias (plain pipe)
		expect(result).toContain("|000 Home]]");
	});
});
