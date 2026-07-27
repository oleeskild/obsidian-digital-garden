import { resolveFrontmatterValue } from "./frontmatterLinks";

const vault: Record<string, string> = {
	"David Berman": "06 Assets/Lyrics/Artists/David Berman.md",
	"06 Assets/Lyrics/Artists/David Berman":
		"06 Assets/Lyrics/Artists/David Berman.md",
	"cover.jpg": "06 Assets/covers/cover.jpg",
};

const resolve = (linkpath: string) => vault[linkpath] ?? null;

describe("resolveFrontmatterValue", () => {
	it("rewrites a bare note wikilink to its full vault path without .md", () => {
		expect(resolveFrontmatterValue("[[David Berman]]", resolve)).toBe(
			"[[06 Assets/Lyrics/Artists/David Berman]]",
		);
	});

	it("keeps an already-full note wikilink unchanged", () => {
		expect(
			resolveFrontmatterValue(
				"[[06 Assets/Lyrics/Artists/David Berman]]",
				resolve,
			),
		).toBe("[[06 Assets/Lyrics/Artists/David Berman]]");
	});

	it("preserves alias suffixes", () => {
		expect(resolveFrontmatterValue("[[David Berman|Dave]]", resolve)).toBe(
			"[[06 Assets/Lyrics/Artists/David Berman|Dave]]",
		);
	});

	it("preserves heading suffixes", () => {
		expect(
			resolveFrontmatterValue("[[David Berman#Early life]]", resolve),
		).toBe("[[06 Assets/Lyrics/Artists/David Berman#Early life]]");
	});

	it("preserves heading plus alias suffixes", () => {
		expect(
			resolveFrontmatterValue("[[David Berman#Early life|bio]]", resolve),
		).toBe("[[06 Assets/Lyrics/Artists/David Berman#Early life|bio]]");
	});

	it("maps arrays element-wise", () => {
		expect(
			resolveFrontmatterValue(
				["[[David Berman]]", "plain text", 42],
				resolve,
			),
		).toEqual([
			"[[06 Assets/Lyrics/Artists/David Berman]]",
			"plain text",
			42,
		]);
	});

	it("resolves image wikilinks inside arrays, keeping the extension", () => {
		expect(resolveFrontmatterValue(["[[cover.jpg]]"], resolve)).toEqual([
			"[[06 Assets/covers/cover.jpg]]",
		]);
	});

	it("leaves unresolvable wikilinks unchanged", () => {
		expect(resolveFrontmatterValue("[[Missing Note]]", resolve)).toBe(
			"[[Missing Note]]",
		);
	});

	it("leaves non-link values unchanged", () => {
		expect(resolveFrontmatterValue("just text", resolve)).toBe("just text");
		expect(resolveFrontmatterValue(42, resolve)).toBe(42);
		expect(resolveFrontmatterValue(null, resolve)).toBe(null);

		expect(resolveFrontmatterValue("https://example.com/x", resolve)).toBe(
			"https://example.com/x",
		);
	});
});
