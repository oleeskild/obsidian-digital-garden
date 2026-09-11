import { findHomePageFiles, hasHomePage } from "../publishFile/homePage";
import type { App, TFile } from "obsidian";

function makeApp(
	files: Array<{ path: string; frontmatter?: Record<string, unknown> }>,
) {
	const tfiles = files.map((f) => ({ path: f.path }) as TFile);

	return {
		vault: { getMarkdownFiles: () => tfiles },
		metadataCache: {
			getFileCache: (file: TFile) => {
				const match = files.find((f) => f.path === file.path);

				return match?.frontmatter
					? { frontmatter: match.frontmatter }
					: null;
			},
		},
	} as unknown as Pick<App, "vault" | "metadataCache">;
}

describe("findHomePageFiles", () => {
	it("returns no files when nothing is flagged", () => {
		const app = makeApp([
			{ path: "a.md", frontmatter: { "dg-publish": true } },
			{ path: "b.md" },
		]);

		expect(findHomePageFiles(app)).toEqual([]);
		expect(hasHomePage(app)).toBe(false);
	});

	it("returns every note with dg-home set", () => {
		const app = makeApp([
			{ path: "home.md", frontmatter: { "dg-home": true } },
			{ path: "other.md", frontmatter: { "dg-home": false } },
			{ path: "second.md", frontmatter: { "dg-home": true } },
		]);

		expect(findHomePageFiles(app).map((f) => f.path)).toEqual([
			"home.md",
			"second.md",
		]);
		expect(hasHomePage(app)).toBe(true);
	});
});
