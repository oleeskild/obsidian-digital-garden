import { sortByPopularity } from "./themes";

jest.mock("obsidian", () => ({ requestUrl: jest.fn() }), { virtual: true });

describe("sortByPopularity", () => {
	const themes = [{ name: "Beta" }, { name: "Alpha" }, { name: "Minimal" }];

	it("puts the most downloaded first, then the rest by name", () => {
		const sorted = sortByPopularity(themes, {
			Minimal: { download: 900 },
			Beta: { download: 10 },
		});

		expect(sorted.map((t) => t.name)).toEqual(["Minimal", "Beta", "Alpha"]);
	});

	it("sorts by name without stats", () => {
		expect(sortByPopularity(themes, {}).map((t) => t.name)).toEqual([
			"Alpha",
			"Beta",
			"Minimal",
		]);
	});
});
