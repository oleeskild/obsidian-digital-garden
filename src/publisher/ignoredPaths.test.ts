import {
	isPathIgnored,
	isPublishedPathIgnored,
	normalizeIgnoredPath,
} from "./ignoredPaths";

describe("ignored paths", () => {
	it("normalizes path entries", () => {
		expect(normalizeIgnoredPath(" /Private\\Drafts/ ")).toBe(
			"Private/Drafts",
		);
	});

	it("matches an exact note or asset path", () => {
		const ignored = ["Drafts/note.md", "Assets/private.png"];
		expect(isPathIgnored("Drafts/note.md", ignored)).toBe(true);
		expect(isPathIgnored("Drafts/other.md", ignored)).toBe(false);
		expect(isPathIgnored("Assets/private.png", ignored)).toBe(true);
	});

	it("matches folder descendants without matching path prefixes", () => {
		const ignored = ["Private", "Archive/Old"];
		expect(isPathIgnored("Private/note.md", ignored)).toBe(true);
		expect(isPathIgnored("Archive/Old/image.png", ignored)).toBe(true);
		expect(isPathIgnored("Privateer/note.md", ignored)).toBe(false);
		expect(isPathIgnored("Archive/New/note.md", ignored)).toBe(false);
	});

	it("ignores empty entries and supports missing settings", () => {
		expect(isPathIgnored("note.md", ["", " / "])).toBe(false);
		expect(isPathIgnored("note.md", undefined)).toBe(false);
	});

	it("maps configured repository roots back to ignored vault paths", () => {
		const ignored = ["Shared/Other Vault", "single.md"];

		expect(
			isPublishedPathIgnored(
				"content/notes/Shared/Other Vault/note.md",
				"content/notes/",
				"public/assets/",
				ignored,
			),
		).toBe(true);

		expect(
			isPublishedPathIgnored(
				"public/assets/single.md",
				"content/notes/",
				"public/assets/",
				ignored,
			),
		).toBe(true);

		expect(
			isPublishedPathIgnored(
				"content/notes/Shared/This Vault/note.md",
				"content/notes/",
				"public/assets/",
				ignored,
			),
		).toBe(false);
	});
});
