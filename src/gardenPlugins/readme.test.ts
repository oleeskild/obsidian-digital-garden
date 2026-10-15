import { absolutizeReadmeLinks, readmeUrls } from "./readme";

const repo = "alice/garden-plugin-x";

describe("readmeUrls", () => {
	it("points at the default branch on raw.githubusercontent.com", () => {
		expect(readmeUrls(repo)[0]).toBe(
			"https://raw.githubusercontent.com/alice/garden-plugin-x/HEAD/README.md",
		);
	});
});

describe("absolutizeReadmeLinks", () => {
	it("rewrites relative markdown images to raw URLs", () => {
		expect(absolutizeReadmeLinks("![shot](./docs/shot.png)", repo)).toBe(
			"![shot](https://raw.githubusercontent.com/alice/garden-plugin-x/HEAD/docs/shot.png)",
		);
	});

	it("rewrites relative links to the GitHub file view", () => {
		expect(
			absolutizeReadmeLinks("See [the docs](docs/usage.md).", repo),
		).toBe(
			"See [the docs](https://github.com/alice/garden-plugin-x/blob/HEAD/docs/usage.md).",
		);
	});

	it("rewrites relative HTML images", () => {
		expect(
			absolutizeReadmeLinks('<img src="shot.png" width="300">', repo),
		).toBe(
			'<img src="https://raw.githubusercontent.com/alice/garden-plugin-x/HEAD/shot.png" width="300">',
		);
	});

	it("leaves absolute URLs and anchors alone", () => {
		const markdown =
			'![a](https://example.com/a.png) [b](#install) [c](mailto:x@y.z) <img src="//cdn.x/y.png">';

		expect(absolutizeReadmeLinks(markdown, repo)).toBe(markdown);
	});

	it("keeps image titles", () => {
		expect(absolutizeReadmeLinks('![a](a.png "Title")', repo)).toBe(
			'![a](https://raw.githubusercontent.com/alice/garden-plugin-x/HEAD/a.png "Title")',
		);
	});
});
