import DigitalGardenSettings from "../models/settings";
import { PublishPlatform } from "../models/PublishPlatform";
import {
	NOTE_PATH_BASE,
	IMAGE_PATH_BASE,
	normalizeContentBaseDir,
	contentBaseDir,
	notePathBase,
	imagePathBase,
	sitePath,
	envPath,
} from "../publisher/paths";

const withBase = (contentBase?: string) =>
	({ contentBaseDir: contentBase }) as DigitalGardenSettings;

describe("paths", () => {
	describe("normalizeContentBaseDir", () => {
		const CASES: Array<{ input: string | undefined; expected: string }> = [
			{ input: undefined, expected: "" },
			{ input: "", expected: "" },
			{ input: "   ", expected: "" },
			{ input: "/", expected: "" },
			{ input: "//", expected: "" },
			{ input: "Web", expected: "Web/" },
			{ input: "Web/", expected: "Web/" },
			{ input: "/Web", expected: "Web/" },
			{ input: "/Web/", expected: "Web/" },
			{ input: "  Web  ", expected: "Web/" },
			{ input: "a/b", expected: "a/b/" },
			{ input: "/a/b/", expected: "a/b/" },
			// Traversal or relative segments are invalid — fall back to the repo root.
			{ input: "..", expected: "" },
			{ input: "../escape", expected: "" },
			{ input: "a/../b", expected: "" },
			{ input: ".", expected: "" },
			{ input: "a/./b", expected: "" },
		];

		it.each(CASES)(
			"normalizes $input -> $expected",
			({ input, expected }) => {
				expect(normalizeContentBaseDir(input)).toBe(expected);
			},
		);

		it("never emits a leading slash or a double slash", () => {
			for (const { input } of CASES) {
				const result = normalizeContentBaseDir(input);
				expect(result.startsWith("/")).toBe(false);
				expect(result.includes("//")).toBe(false);
			}
		});
	});

	describe("path builders — backward compatibility (empty base)", () => {
		const settings = withBase("");

		it("contentBaseDir is empty", () => {
			expect(contentBaseDir(settings)).toBe("");
		});

		it("notePathBase equals the historical literal", () => {
			expect(notePathBase(settings)).toBe("src/site/notes/");
			expect(notePathBase(settings)).toBe(NOTE_PATH_BASE);
		});

		it("imagePathBase equals the historical literal", () => {
			expect(imagePathBase(settings)).toBe("src/site/img/user/");
			expect(imagePathBase(settings)).toBe(IMAGE_PATH_BASE);
		});

		it("sitePath equals the historical literal", () => {
			expect(sitePath(settings, "/favicon.svg")).toBe(
				"src/site/favicon.svg",
			);

			expect(sitePath(settings, "/img/user/a.png")).toBe(
				"src/site/img/user/a.png",
			);
		});

		it("envPath equals the historical literal", () => {
			expect(envPath(settings)).toBe(".env");
		});

		it("matches for undefined contentBaseDir too", () => {
			const undefinedSettings = withBase(undefined);
			expect(notePathBase(undefinedSettings)).toBe("src/site/notes/");
			expect(imagePathBase(undefinedSettings)).toBe("src/site/img/user/");
			expect(envPath(undefinedSettings)).toBe(".env");
		});
	});

	describe("path builders — with a base directory", () => {
		it.each(["Web", "Web/", "/Web/"])(
			"prefixes every path with %s -> Web/",
			(base) => {
				const settings = withBase(base);
				expect(notePathBase(settings)).toBe("Web/src/site/notes/");
				expect(imagePathBase(settings)).toBe("Web/src/site/img/user/");

				expect(sitePath(settings, "/favicon.svg")).toBe(
					"Web/src/site/favicon.svg",
				);
				expect(envPath(settings)).toBe("Web/.env");
			},
		);

		it("supports nested base directories", () => {
			const settings = withBase("a/b");
			expect(notePathBase(settings)).toBe("a/b/src/site/notes/");
			expect(imagePathBase(settings)).toBe("a/b/src/site/img/user/");
			expect(envPath(settings)).toBe("a/b/.env");
		});

		it("never produces a leading slash or a double slash", () => {
			const settings = withBase("/Web/");

			const produced = [
				notePathBase(settings),
				imagePathBase(settings),
				sitePath(settings, "/logo.png"),
				envPath(settings),
			];

			for (const p of produced) {
				expect(p.startsWith("/")).toBe(false);
				expect(p.includes("//")).toBe(false);
			}
		});
	});

	describe("path builders — publish platform gating", () => {
		const withPlatform = (
			contentBase: string,
			publishPlatform: PublishPlatform,
		) =>
			({
				contentBaseDir: contentBase,
				publishPlatform,
			}) as DigitalGardenSettings;

		it("ignores contentBaseDir on the Forestry platform", () => {
			const settings = withPlatform("Web", PublishPlatform.ForestryMd);

			expect(contentBaseDir(settings)).toBe("");
			expect(notePathBase(settings)).toBe("src/site/notes/");
			expect(imagePathBase(settings)).toBe("src/site/img/user/");

			expect(sitePath(settings, "/favicon.svg")).toBe(
				"src/site/favicon.svg",
			);
			expect(envPath(settings)).toBe(".env");
		});

		it("applies contentBaseDir on the self-hosted (GitHub) platform", () => {
			const settings = withPlatform("Web", PublishPlatform.SelfHosted);

			expect(notePathBase(settings)).toBe("Web/src/site/notes/");
			expect(envPath(settings)).toBe("Web/.env");
		});
	});
});
