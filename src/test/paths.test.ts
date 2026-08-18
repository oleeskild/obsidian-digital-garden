import DigitalGardenSettings from "../models/settings";
import { PublishPlatform } from "../models/PublishPlatform";
import {
	IMAGE_PATH_BASE,
	NOTE_PATH_BASE,
	envPath,
	imagePathBase,
	normalizeRepoDirectory,
	normalizeRepoPath,
	notePathBase,
	sitePath,
} from "../publisher/paths";

const settings = (overrides: Partial<DigitalGardenSettings> = {}) =>
	({
		publishPlatform: PublishPlatform.GitHub,
		...overrides,
	}) as DigitalGardenSettings;

describe("repository paths", () => {
	it("retains the historical defaults", () => {
		const value = settings();
		expect(notePathBase(value)).toBe(NOTE_PATH_BASE);
		expect(imagePathBase(value)).toBe(IMAGE_PATH_BASE);
		expect(sitePath(value, "/favicon.svg")).toBe("src/site/favicon.svg");
		expect(envPath(value)).toBe(".env");
	});

	it("uses independent repository-relative destinations", () => {
		const value = settings({
			notesDirectory: "/content/articles/",
			assetsDirectory: "public\\uploads",
			siteDirectory: "app/site",
			settingsFilePath: "config/garden.env",
		});

		expect(notePathBase(value)).toBe("content/articles/");
		expect(imagePathBase(value)).toBe("public/uploads/");
		expect(sitePath(value, "/logo.png")).toBe("app/site/logo.png");
		expect(envPath(value)).toBe("config/garden.env");
	});

	it("rejects traversal and falls back to defaults", () => {
		const value = settings({
			notesDirectory: "../outside",
			assetsDirectory: "public/../outside",
			siteDirectory: ".",
			settingsFilePath: "config/../secret",
		});

		expect(notePathBase(value)).toBe(NOTE_PATH_BASE);
		expect(imagePathBase(value)).toBe(IMAGE_PATH_BASE);
		expect(sitePath(value, "logo.png")).toBe("src/site/logo.png");
		expect(envPath(value)).toBe(".env");
	});

	it("normalizes separators and surrounding slashes", () => {
		expect(normalizeRepoDirectory(" /a//b\\c/ ")).toBe("a/b/c/");
		expect(normalizeRepoPath("/config/site.env/")).toBe("config/site.env");
	});

	it("keeps the managed platform layout fixed", () => {
		const value = settings({
			publishPlatform: PublishPlatform.ForestryMd,
			notesDirectory: "content",
			assetsDirectory: "public",
			siteDirectory: "site",
			settingsFilePath: "config.env",
		});

		expect(notePathBase(value)).toBe(NOTE_PATH_BASE);
		expect(imagePathBase(value)).toBe(IMAGE_PATH_BASE);
		expect(sitePath(value, "logo.png")).toBe("src/site/logo.png");
		expect(envPath(value)).toBe(".env");
	});
});
