import * as fs from "fs";
import * as path from "path";
import { FrontMatterCache, MetadataCache, TFile, Vault } from "obsidian";
import { CompiledPublishFile } from "../../publishFile/PublishFile";
import {
	GardenPageCompiler,
	TCompiledFile,
} from "../../compiler/GardenPageCompiler";
import { FrontmatterCompiler } from "../../compiler/FrontmatterCompiler";
import DigitalGardenSettings from "../../models/settings";
import { generateBlobHash } from "../../utils/utils";
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

// Polyfill Obsidian's String.contains and Array.contains
declare global {
	interface String {
		contains(searchString: string): boolean;
	}
	interface Array<T> {
		contains(searchElement: T): boolean;
	}
}

if (!String.prototype.contains) {
	String.prototype.contains = function (searchString: string): boolean {
		return this.includes(searchString);
	};
}

if (!Array.prototype.contains) {
	Array.prototype.contains = function <T>(searchElement: T): boolean {
		return this.includes(searchElement);
	};
}

describe("Integration: Timestamp hash stability", () => {
	const TEST_VAULT_PATH = path.join(__dirname, "../../dg-testVault");

	// Simulated file database for the test vault
	const testVaultFiles: Record<string, { path: string; extension: string }> =
		{
			"000 Home": { path: "000 Home.md", extension: "md" },
			"001 Links": { path: "001 Links.md", extension: "md" },
			"010 custom createdAt": {
				path: "010 custom createdAt.md",
				extension: "md",
			},
			"011 Custom updatedAt": {
				path: "011 Custom updatedAt.md",
				extension: "md",
			},
		};

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
			showCreatedTimestamp: true,
			showUpdatedTimestamp: true,
			createdTimestampKey: "",
			updatedTimestampKey: "",
			contentClassesKey: "",
			customFilters: [],
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
		} as unknown as DigitalGardenSettings;
	};

	const createMockMetadataCache = (
		frontmatter: Record<string, unknown> = {},
	): MetadataCache => {
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
					...frontmatter,
				},
			})),
		} as unknown as MetadataCache;
	};

	const createMockFile = (
		filePath: string,
		mtime: number,
		ctime: number = 1705200000000,
	): TFile => {
		return {
			path: filePath,
			name: filePath.split("/").pop() || filePath,
			extension: "md",
			stat: {
				ctime,
				mtime,
				size: 100,
			},
			vault: {} as Vault,
			basename: filePath.replace(".md", ""),
			parent: null,
		} as TFile;
	};

	const createCompiledPublishFile = (
		settings: DigitalGardenSettings,
		compiledContent: string,
		file: TFile,
		metadataCache: MetadataCache,
	): CompiledPublishFile => {
		const mockVault = {} as Vault;
		const mockCompiler = {} as GardenPageCompiler;

		const compiledFile: TCompiledFile = [compiledContent, { images: [] }];

		return new CompiledPublishFile(
			{
				file,
				vault: mockVault,
				compiler: mockCompiler,
				metadataCache,
				settings,
			},
			compiledFile,
		);
	};

	describe("Notes without custom timestamp keys (e.g., 000 Home.md)", () => {
		it("should produce stable hashes when file.stat.mtime changes but content is same", () => {
			// Read actual file from test vault
			const testFilePath = path.join(TEST_VAULT_PATH, "000 Home.md");
			const fileContent = fs.readFileSync(testFilePath, "utf-8");

			// Settings with NO custom timestamp keys (fallback to file.stat)
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const frontmatterCompiler = new FrontmatterCompiler(settings);

			// Create mock PublishFile for frontmatter compilation
			const createMockPublishFile = (mtime: number) =>
				({
					getPath: () => "000 Home.md",
					meta: {
						// Simulate different mtimes returning different ISO timestamps
						getCreatedAt: () => "2024-01-10T10:00:00.000Z",
						getUpdatedAt: () => new Date(mtime).toISOString(),
					},
				}) as unknown as PublishFile;

			// Compile frontmatter with mtime = T1 (Jan 15)
			const mockFileT1 = createMockPublishFile(1705312800000);

			const frontmatterT1 = frontmatterCompiler.compile(mockFileT1, {
				"dg-home": true,
				"dg-publish": true,
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache);

			// Compile frontmatter with mtime = T2 (Feb 1 - simulating sync touch)
			const mockFileT2 = createMockPublishFile(1706774400000);

			const frontmatterT2 = frontmatterCompiler.compile(mockFileT2, {
				"dg-home": true,
				"dg-publish": true,
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache);

			// The compiled frontmatter WILL be different (different timestamps)
			expect(frontmatterT1).not.toBe(frontmatterT2);

			// But when we create CompiledPublishFiles and get hash content...
			const bodyContent = fileContent.replace(/^---[\s\S]*?---\n/, "");
			const compiledContentT1 = frontmatterT1 + bodyContent;
			const compiledContentT2 = frontmatterT2 + bodyContent;

			const metadataCache = createMockMetadataCache();
			const tfileT1 = createMockFile("000 Home.md", 1705312800000);
			const tfileT2 = createMockFile("000 Home.md", 1706774400000);

			const compiledFileT1 = createCompiledPublishFile(
				settings,
				compiledContentT1,
				tfileT1,
				metadataCache,
			);

			const compiledFileT2 = createCompiledPublishFile(
				settings,
				compiledContentT2,
				tfileT2,
				metadataCache,
			);

			// Hash content should be IDENTICAL (auto-generated timestamps stripped)
			const hashContentT1 = compiledFileT1.getContentForHashComparison();
			const hashContentT2 = compiledFileT2.getContentForHashComparison();

			expect(hashContentT1).toBe(hashContentT2);

			// And actual hashes should be identical
			expect(generateBlobHash(hashContentT1)).toBe(
				generateBlobHash(hashContentT2),
			);
		});

		it("should still detect actual content changes", () => {
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const metadataCache = createMockMetadataCache();

			// Original content
			const contentOriginal = `---
{"dg-publish":true,"created":"2024-01-10T10:00:00.000Z","updated":"2024-01-15T10:00:00.000Z","permalink":"/000-home/"}
---

## Welcome

Original welcome message.`;

			// Modified content (body changed)
			const contentModified = `---
{"dg-publish":true,"created":"2024-01-10T10:00:00.000Z","updated":"2024-01-15T10:00:00.000Z","permalink":"/000-home/"}
---

## Welcome

Modified welcome message with new content!`;

			const file = createMockFile("000 Home.md", 1705312800000);

			const compiledOriginal = createCompiledPublishFile(
				settings,
				contentOriginal,
				file,
				metadataCache,
			);

			const compiledModified = createCompiledPublishFile(
				settings,
				contentModified,
				file,
				metadataCache,
			);

			// Hashes should be DIFFERENT because actual content changed
			expect(
				generateBlobHash(
					compiledOriginal.getContentForHashComparison(),
				),
			).not.toBe(
				generateBlobHash(
					compiledModified.getContentForHashComparison(),
				),
			);
		});
	});

	describe("Notes with custom timestamp keys (e.g., 010 custom createdAt.md)", () => {
		it("should include user-managed timestamps in hash comparison", () => {
			// Read actual file from test vault
			const testFilePath = path.join(
				TEST_VAULT_PATH,
				"010 custom createdAt.md",
			);
			const fileContent = fs.readFileSync(testFilePath, "utf-8");

			// Verify the file has the expected custom timestamp
			expect(fileContent).toContain("customCreated: 2020-01-01");

			// Settings WITH custom timestamp key configured
			const settings = createMockSettings({
				createdTimestampKey: "customCreated",
				updatedTimestampKey: "",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const frontmatterCompiler = new FrontmatterCompiler(settings);

			const metadataCache = createMockMetadataCache({
				customCreated: "2020-01-01",
			});

			// Create mock PublishFile that returns the custom timestamp
			const mockFileV1 = {
				getPath: () => "010 custom createdAt.md",
				meta: {
					getCreatedAt: () => "2020-01-01",
					getUpdatedAt: () => "2024-01-15T10:00:00.000Z",
				},
			} as unknown as PublishFile;

			const frontmatterV1 = frontmatterCompiler.compile(mockFileV1, {
				"dg-publish": true,
				customCreated: "2020-01-01",
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache);

			// Now simulate user changing their custom timestamp
			const mockFileV2 = {
				getPath: () => "010 custom createdAt.md",
				meta: {
					getCreatedAt: () => "2022-06-15", // User changed this!
					getUpdatedAt: () => "2024-01-15T10:00:00.000Z",
				},
			} as unknown as PublishFile;

			const frontmatterV2 = frontmatterCompiler.compile(mockFileV2, {
				"dg-publish": true,
				customCreated: "2022-06-15",
				position: { start: { line: 0 }, end: { line: 3 } },
			} as unknown as FrontMatterCache);

			const bodyContent = "This file should have createdAt: 2020-01-01";
			const compiledContentV1 = frontmatterV1 + bodyContent;
			const compiledContentV2 = frontmatterV2 + bodyContent;

			const file = createMockFile(
				"010 custom createdAt.md",
				1705312800000,
			);

			const compiledFileV1 = createCompiledPublishFile(
				settings,
				compiledContentV1,
				file,
				metadataCache,
			);

			const compiledFileV2 = createCompiledPublishFile(
				settings,
				compiledContentV2,
				file,
				metadataCache,
			);

			// Hash content should be DIFFERENT because user-managed timestamp changed
			const hashContentV1 = compiledFileV1.getContentForHashComparison();
			const hashContentV2 = compiledFileV2.getContentForHashComparison();

			// The "created" timestamp should be preserved in hash content
			expect(hashContentV1).toContain('"created"');
			expect(hashContentV2).toContain('"created"');

			// But the "updated" (auto-generated) should be stripped
			expect(hashContentV1).not.toContain('"updated"');

			// Hashes should differ because created timestamp (user-managed) changed
			expect(generateBlobHash(hashContentV1)).not.toBe(
				generateBlobHash(hashContentV2),
			);
		});
	});

	describe("Mixed configuration (011 Custom updatedAt.md scenario)", () => {
		it("should strip auto-generated created but keep user-managed updated", () => {
			// Read actual file from test vault
			const testFilePath = path.join(
				TEST_VAULT_PATH,
				"011 Custom updatedAt.md",
			);
			const fileContent = fs.readFileSync(testFilePath, "utf-8");

			// Verify the file has the expected custom timestamp
			expect(fileContent).toContain("customUpdated: 2021-01-01");

			// Settings with only updatedTimestampKey configured
			const settings = createMockSettings({
				createdTimestampKey: "", // Falls back to file.stat.ctime
				updatedTimestampKey: "customUpdated", // User-managed
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const metadataCache = createMockMetadataCache({
				customUpdated: "2021-01-01",
			});

			// Simulated compiled content with auto-generated created and user-managed updated
			const compiledContent = `---
{"dg-publish":true,"created":"2024-01-10T10:00:00.000Z","updated":"2021-01-01","permalink":"/011-custom-updatedat/"}
---

This file should have updatedAt: 2021-01-01`;

			const file = createMockFile(
				"011 Custom updatedAt.md",
				1705312800000,
			);

			const compiledFile = createCompiledPublishFile(
				settings,
				compiledContent,
				file,
				metadataCache,
			);

			const hashContent = compiledFile.getContentForHashComparison();

			// "created" (auto-generated) should be stripped
			expect(hashContent).not.toContain('"created"');
			// "updated" (user-managed) should be kept
			expect(hashContent).toContain('"updated":"2021-01-01"');
		});
	});
});
