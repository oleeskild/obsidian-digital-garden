import {
	isSafePluginPath,
	parseGitHubRepoInput,
	shouldSkipRepoFile,
	validateGardenPluginManifest,
} from "./manifest";

describe("parseGitHubRepoInput", () => {
	it.each([
		["owner/repo", "owner", "repo"],
		["https://github.com/owner/repo", "owner", "repo"],
		["http://github.com/owner/repo", "owner", "repo"],
		["https://www.github.com/owner/repo", "owner", "repo"],
		["https://github.com/owner/repo.git", "owner", "repo"],
		["https://github.com/owner/repo/", "owner", "repo"],
		["https://github.com/owner/repo/tree/main/src", "owner", "repo"],
		["git@github.com:owner/repo.git", "owner", "repo"],
		["  owner/repo  ", "owner", "repo"],
	])("parses %s", (input, owner, repo) => {
		expect(parseGitHubRepoInput(input)).toEqual({ owner, repo });
	});

	it.each([
		[""],
		["   "],
		["just-a-name"],
		["https://gitlab.com/owner/repo"],
		["https://evil.com/owner/repo"],
	])("rejects %s", (input) => {
		expect(parseGitHubRepoInput(input)).toBeUndefined();
	});
});

describe("isSafePluginPath", () => {
	it.each([["templates/foo.njk"], ["index.js"], ["assets/"], ["a/b/c.css"]])(
		"accepts %s",
		(path) => {
			expect(isSafePluginPath(path)).toBe(true);
		},
	);

	it.each([
		[""],
		["/abs/path.js"],
		["../escape.js"],
		["a/../../b.js"],
		["a/./b.js"],
		["a//b.js"],
		["a\\b.js"],
	])("rejects %s", (path) => {
		expect(isSafePluginPath(path)).toBe(false);
	});
});

const validManifest = {
	id: "my-plugin",
	name: "My Plugin",
	version: "1.0.0",
	description: "Does things",
	author: "Someone",
};

describe("validateGardenPluginManifest", () => {
	it("accepts a minimal valid manifest", () => {
		const { manifest, errors } =
			validateGardenPluginManifest(validManifest);

		expect(errors).toEqual([]);
		expect(manifest?.id).toBe("my-plugin");
	});

	it("rejects a manifest with missing required fields", () => {
		const { manifest, errors } = validateGardenPluginManifest({
			id: "my-plugin",
		});

		expect(manifest).toBeUndefined();
		expect(errors.join()).toContain("name");
		expect(errors.join()).toContain("version");
	});

	it("rejects non-object input", () => {
		expect(validateGardenPluginManifest(null).manifest).toBeUndefined();
		expect(validateGardenPluginManifest("hi").manifest).toBeUndefined();
	});

	it("rejects invalid ids", () => {
		const { manifest } = validateGardenPluginManifest({
			...validManifest,
			id: "My Plugin!",
		});

		expect(manifest).toBeUndefined();
	});

	it("rejects the reserved dg- prefix unless allowFirstParty", () => {
		const reserved = { ...validManifest, id: "dg-search" };

		expect(validateGardenPluginManifest(reserved).manifest).toBeUndefined();

		expect(
			validateGardenPluginManifest(reserved, { allowFirstParty: true })
				.manifest,
		).toBeDefined();
	});

	it("rejects unsafe declared paths", () => {
		const { manifest, errors } = validateGardenPluginManifest({
			...validManifest,
			styles: ["../../evil.scss"],
		});

		expect(manifest).toBeUndefined();
		expect(errors.join()).toContain("unsafe path");
	});

	it("accepts slots declared as string or array", () => {
		const { manifest } = validateGardenPluginManifest({
			...validManifest,
			slots: {
				"notes.footer": "templates/a.njk",
				"common.head": ["templates/b.njk", "templates/c.njk"],
			},
		});

		expect(manifest).toBeDefined();
	});
});

describe("shouldSkipRepoFile", () => {
	it.each([
		[".gitignore"],
		[".github/workflows/ci.yml"],
		["node_modules/foo/index.js"],
	])("skips %s", (path) => {
		expect(shouldSkipRepoFile(path)).toBe(true);
	});

	it.each([["garden-plugin.json"], ["templates/foo.njk"], ["README.md"]])(
		"keeps %s",
		(path) => {
			expect(shouldSkipRepoFile(path)).toBe(false);
		},
	);
});
