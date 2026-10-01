import { MetadataCache } from "obsidian";
import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { TRepositoryContent } from "../repositoryConnection/RepositoryConnection";

jest.mock("obsidian");

const settings = {
	pathRewriteRules: "",
	notesDirectory: "content/articles",
	assetsDirectory: "public/uploads",
} as DigitalGardenSettings;

const tree = {
	tree: [
		{ path: "content/articles/note.md", sha: "note-sha", type: "blob" },
		{ path: "content/articles/notes.json", sha: "json-sha", type: "blob" },
		{ path: "public/uploads/pic.png", sha: "img-sha", type: "blob" },
		{ path: "README.md", sha: "readme-sha", type: "blob" },
		{ path: "other/content/articles/x.md", sha: "x-sha", type: "blob" },
	],
} as unknown as NonNullable<TRepositoryContent>;

describe("DigitalGardenSiteManager custom paths", () => {
	const manager = new DigitalGardenSiteManager({} as MetadataCache, settings);

	it("strips the configured notes directory and skips notes.json", async () => {
		await expect(manager.getNoteHashes(tree)).resolves.toEqual({
			"note.md": "note-sha",
		});
	});

	it("strips the configured assets directory", async () => {
		await expect(manager.getImageHashes(tree)).resolves.toEqual({
			"pic.png": "img-sha",
		});
	});
});

describe("DigitalGardenSiteManager.updateEnv", () => {
	const makeEnvSettings = (
		overrides: Partial<DigitalGardenSettings> = {},
	): DigitalGardenSettings =>
		({
			contentBaseDir: "",
			pathRewriteRules: "",
			theme: '{"name":"default","modes":["dark"]}',
			baseTheme: "dark",
			siteName: "New Name",
			mainLanguage: "en",
			gardenBaseUrl: "",
			showCreatedTimestamp: true,
			timestampFormat: "MMM dd, yyyy h:mm a",
			showUpdatedTimestamp: false,
			defaultNoteIcon: "",
			showNoteIconOnTitle: false,
			showNoteIconInFileTree: false,
			showNoteIconOnInternalLink: false,
			showNoteIconOnBackLink: false,
			styleSettingsCss: "",
			styleSettingsBodyClasses: "",
			useFullResolutionImages: false,
			logoHeight: "",
			uiStrings: {},
			defaultNoteSettings: { dgHomeLink: true },
			...overrides,
		}) as unknown as DigitalGardenSettings;

	const runUpdateEnv = async (
		settings: DigitalGardenSettings,
		existingEnv: string,
		touchedKeys?: string[],
	): Promise<Record<string, string> | null> => {
		const manager = new DigitalGardenSiteManager(
			{} as MetadataCache,
			settings,
		);

		const updateFile = jest.fn();

		jest.spyOn(manager, "getUserGardenConnection").mockResolvedValue({
			getFile: async () => ({
				content: Buffer.from(existingEnv).toString("base64"),
				sha: "env-sha",
			}),
			updateFile,
		} as never);

		await manager.updateEnv(touchedKeys);

		if (!updateFile.mock.calls.length) {
			return null;
		}

		const written = Buffer.from(
			updateFile.mock.calls[0][0].content,
			"base64",
		).toString();

		return Object.fromEntries(
			written
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const [key, ...rest] = line.split("=");

					return [key, rest.join("=")];
				}),
		);
	};

	it("only writes touched keys, preserving remote values for the rest", async () => {
		const written = await runUpdateEnv(
			makeEnvSettings(),
			"CUSTOM_KEY=kept\nSITE_NAME_HEADER=Old Name\nSHOW_CREATED_TIMESTAMP=false",
			["SITE_NAME_HEADER"],
		);

		expect(written).not.toBeNull();
		expect(written?.["SITE_NAME_HEADER"]).toBe("New Name");
		// Untouched keys keep their remote values even though the local
		// settings differ (showCreatedTimestamp is locally true).
		expect(written?.["SHOW_CREATED_TIMESTAMP"]).toBe("false");
		expect(written?.["CUSTOM_KEY"]).toBe("kept");
	});

	it("removes a touched key the local settings no longer produce", async () => {
		const written = await runUpdateEnv(
			makeEnvSettings({ logoHeight: "" }),
			"LOGO_HEIGHT=99\nCUSTOM_KEY=kept",
			["LOGO_HEIGHT"],
		);

		expect(written).not.toBeNull();
		expect(written?.["LOGO_HEIGHT"]).toBeUndefined();
		expect(written?.["CUSTOM_KEY"]).toBe("kept");
	});

	it("writes a touched LOGO_HEIGHT when set", async () => {
		const written = await runUpdateEnv(
			makeEnvSettings({ logoHeight: "64" }),
			"CUSTOM_KEY=kept",
			["LOGO_HEIGHT"],
		);

		expect(written?.["LOGO_HEIGHT"]).toBe("64");
		expect(written?.["CUSTOM_KEY"]).toBe("kept");
	});

	it("does not write at all when the touched keys match the remote", async () => {
		const written = await runUpdateEnv(
			makeEnvSettings(),
			"SITE_NAME_HEADER=New Name",
			["SITE_NAME_HEADER"],
		);

		expect(written).toBeNull();
	});

	it("syncs all generated keys when no touched keys are given", async () => {
		const written = await runUpdateEnv(
			makeEnvSettings(),
			"CUSTOM_KEY=kept\nSHOW_CREATED_TIMESTAMP=false",
		);

		expect(written?.["SHOW_CREATED_TIMESTAMP"]).toBe("true");
		expect(written?.["SITE_NAME_HEADER"]).toBe("New Name");
		expect(written?.["CUSTOM_KEY"]).toBe("kept");
	});
});
