import { MetadataCache } from "obsidian";
import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../models/settings";
import { TRepositoryContent } from "../repositoryConnection/RepositoryConnection";

jest.mock("obsidian");

const makeSettings = (contentBaseDir: string): DigitalGardenSettings =>
	({
		pathRewriteRules: "",
		contentBaseDir,
	}) as DigitalGardenSettings;

const makeTree = (base: string): NonNullable<TRepositoryContent> =>
	({
		tree: [
			{
				path: `${base}src/site/notes/note.md`,
				sha: "note-sha",
				type: "blob",
			},
			{
				path: `${base}src/site/notes/notes.json`,
				sha: "json-sha",
				type: "blob",
			},
			{
				path: `${base}src/site/img/user/pic.png`,
				sha: "img-sha",
				type: "blob",
			},
			// Files outside the garden base must be ignored.
			{ path: `README.md`, sha: "readme-sha", type: "blob" },
			{ path: `other/src/site/notes/x.md`, sha: "x-sha", type: "blob" },
		],
	}) as unknown as NonNullable<TRepositoryContent>;

describe("DigitalGardenSiteManager base stripping", () => {
	const makeManager = (contentBaseDir: string) =>
		new DigitalGardenSiteManager(
			{} as MetadataCache,
			makeSettings(contentBaseDir),
		);

	describe.each([
		{ label: "no base (repo root)", base: "" },
		{ label: "Web subfolder", base: "Web/" },
	])("$label", ({ base }) => {
		it("strips the base from note hashes and skips notes.json", async () => {
			const manager = makeManager(base.replace(/\/$/, ""));
			const hashes = await manager.getNoteHashes(makeTree(base));

			expect(hashes).toEqual({ "note.md": "note-sha" });
			expect(hashes["notes.json"]).toBeUndefined();
		});

		it("strips the base from image hashes", async () => {
			const manager = makeManager(base.replace(/\/$/, ""));
			const hashes = await manager.getImageHashes(makeTree(base));

			expect(hashes).toEqual({ "pic.png": "img-sha" });
		});
	});

	it("does not pick up files that share the suffix under a different base", async () => {
		// A repo-root garden must not treat `other/src/site/...` as its own.
		const manager = makeManager("");
		const hashes = await manager.getNoteHashes(makeTree(""));

		expect(Object.keys(hashes)).toEqual(["note.md"]);
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
