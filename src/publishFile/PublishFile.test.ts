import { MetadataCache, TFile, Vault } from "obsidian";
import { CompiledPublishFile } from "./PublishFile";
import {
	GardenPageCompiler,
	TCompiledFile,
} from "../compiler/GardenPageCompiler";
import DigitalGardenSettings from "../models/settings";

jest.mock("obsidian");

// Obsidian adds custom methods to String prototype
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

describe("CompiledPublishFile", () => {
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

	const createMockFile = (overrides: Partial<TFile> = {}): TFile => {
		return {
			path: "test/note.md",
			name: "note.md",
			extension: "md",
			stat: {
				ctime: 1705300000000,
				mtime: 1705400000000,
				size: 100,
			},
			vault: {} as Vault,
			basename: "note",
			parent: null,
			...overrides,
		} as TFile;
	};

	const createCompiledPublishFile = (
		settings: DigitalGardenSettings,
		compiledContent: string,
	): CompiledPublishFile => {
		const mockFile = createMockFile();
		const mockVault = {} as Vault;

		const mockMetadataCache = {
			getCache: jest.fn().mockReturnValue({
				frontmatter: { "dg-publish": true },
			}),
		} as unknown as MetadataCache;
		const mockCompiler = {} as GardenPageCompiler;

		const compiledFile: TCompiledFile = [compiledContent, { images: [] }];

		return new CompiledPublishFile(
			{
				file: mockFile,
				vault: mockVault,
				compiler: mockCompiler,
				metadataCache: mockMetadataCache,
				settings,
			},
			compiledFile,
		);
	};

	describe("getContentForHashComparison", () => {
		it("should return full content when both timestamp keys are configured", () => {
			const settings = createMockSettings({
				createdTimestampKey: "customCreated",
				updatedTimestampKey: "customUpdated",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const content = `---
{"dg-publish":true,"created":"2024-01-15","updated":"2024-01-20","permalink":"/test/"}
---

# Test Note

Some content here.`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// When both keys are user-configured, content should be unchanged
			expect(hashContent).toBe(content);
			expect(hashContent).toContain('"created":"2024-01-15"');
			expect(hashContent).toContain('"updated":"2024-01-20"');
		});

		it("should strip 'created' when createdTimestampKey is not set but keep 'updated' when updatedTimestampKey is set", () => {
			const settings = createMockSettings({
				createdTimestampKey: "", // Not configured - uses file.stat.ctime
				updatedTimestampKey: "customUpdated", // Configured - user-managed
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const content = `---
{"dg-publish":true,"created":"2024-01-15T10:00:00.000Z","updated":"2024-01-20","permalink":"/test/"}
---

# Test Note`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// "created" should be stripped (auto-generated from file.stat)
			expect(hashContent).not.toContain('"created"');
			// "updated" should be kept (user-managed via customUpdated key)
			expect(hashContent).toContain('"updated":"2024-01-20"');
		});

		it("should strip 'updated' when updatedTimestampKey is not set but keep 'created' when createdTimestampKey is set", () => {
			const settings = createMockSettings({
				createdTimestampKey: "customCreated", // Configured - user-managed
				updatedTimestampKey: "", // Not configured - uses file.stat.mtime
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const content = `---
{"dg-publish":true,"created":"2024-01-15","updated":"2024-01-20T15:30:00.000Z","permalink":"/test/"}
---

# Test Note`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// "created" should be kept (user-managed via customCreated key)
			expect(hashContent).toContain('"created":"2024-01-15"');
			// "updated" should be stripped (auto-generated from file.stat)
			expect(hashContent).not.toContain('"updated"');
		});

		it("should strip both timestamps when neither key is configured", () => {
			const settings = createMockSettings({
				createdTimestampKey: "", // Not configured
				updatedTimestampKey: "", // Not configured
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const content = `---
{"dg-publish":true,"created":"2024-01-15T10:00:00.000Z","updated":"2024-01-20T15:30:00.000Z","permalink":"/test/"}
---

# Test Note`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// Both should be stripped (auto-generated from file.stat)
			expect(hashContent).not.toContain('"created"');
			expect(hashContent).not.toContain('"updated"');
			// Other frontmatter should be preserved
			expect(hashContent).toContain('"dg-publish":true');
			expect(hashContent).toContain('"permalink":"/test/"');
		});

		it("should produce stable hash regardless of file.stat mtime changes", () => {
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			// Simulate compile at time T1
			const contentT1 = `---
{"dg-publish":true,"created":"2024-01-15T10:00:00.000Z","updated":"2024-01-20T15:30:00.000Z","permalink":"/test/"}
---

# Test Note`;

			// Simulate compile at time T2 (mtime changed due to sync)
			const contentT2 = `---
{"dg-publish":true,"created":"2024-01-15T10:00:00.000Z","updated":"2024-02-01T08:00:00.000Z","permalink":"/test/"}
---

# Test Note`;

			const compiledFile1 = createCompiledPublishFile(
				settings,
				contentT1,
			);

			const compiledFile2 = createCompiledPublishFile(
				settings,
				contentT2,
			);

			const hashContent1 = compiledFile1.getContentForHashComparison();
			const hashContent2 = compiledFile2.getContentForHashComparison();

			// Hash content should be identical even though mtime changed
			expect(hashContent1).toBe(hashContent2);
		});

		it("should handle content without timestamps gracefully", () => {
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
				showCreatedTimestamp: false,
				showUpdatedTimestamp: false,
			});

			const content = `---
{"dg-publish":true,"permalink":"/test/"}
---

# Test Note`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// Content should be unchanged
			expect(hashContent).toBe(content);
		});

		it("should handle malformed frontmatter without crashing", () => {
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
			});

			const content = `---
not valid json
---

# Test Note`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// Should return original content if frontmatter can't be parsed
			expect(hashContent).toBe(content);
		});

		it("should preserve body content unchanged while stripping frontmatter timestamps", () => {
			const settings = createMockSettings({
				createdTimestampKey: "",
				updatedTimestampKey: "",
				showCreatedTimestamp: true,
				showUpdatedTimestamp: true,
			});

			const bodyContent = `# Test Note

This note contains the word "created" and "updated" in the body.
These should NOT be removed.

created: some text
updated: other text`;

			const content = `---
{"dg-publish":true,"created":"2024-01-15T10:00:00.000Z","updated":"2024-01-20T15:30:00.000Z","permalink":"/test/"}
---

${bodyContent}`;

			const compiledFile = createCompiledPublishFile(settings, content);
			const hashContent = compiledFile.getContentForHashComparison();

			// Body content should be fully preserved
			expect(hashContent).toContain(bodyContent);
			// Only frontmatter timestamps should be stripped
			expect(hashContent).not.toMatch(/"created":"[^"]+"/);
			expect(hashContent).not.toMatch(/"updated":"[^"]+"/);
		});
	});
});
