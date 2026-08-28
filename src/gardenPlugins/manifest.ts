import { GardenPluginManifest } from "src/models/gardenPlugin";

/**
 * Pure helpers for the garden plugin installer: GitHub URL parsing and
 * manifest validation. Mirrors the rules enforced by the template's
 * pluginLoader (see docs/PLUGIN_INSTALLER_SPEC.md in oleeskild/digitalgarden)
 * so an invalid plugin is rejected before anything is written.
 */

export const GARDEN_PLUGIN_MANIFEST_NAME = "garden-plugin.json";
export const MAX_PLUGIN_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_PLUGIN_TOTAL_SIZE = 10 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const REQUIRED_FIELDS = [
	"id",
	"name",
	"version",
	"description",
	"author",
] as const;

/**
 * Parse a GitHub repo reference in any common shape into owner/name:
 * `owner/repo`, `https://github.com/owner/repo`, with or without `.git`,
 * trailing slashes, or a deep link into the repo.
 */
export function parseGitHubRepoInput(
	input: string,
): { owner: string; repo: string } | undefined {
	const trimmed = input.trim();

	if (!trimmed) {
		return undefined;
	}

	const withoutProtocol = trimmed
		.replace(/^(https?:\/\/)?(www\.)?github\.com[/:]/i, "")
		.replace(/^git@github\.com:/i, "");

	// Reject full URLs to other hosts.
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutProtocol)) {
		return undefined;
	}

	const segments = withoutProtocol.split("/").filter(Boolean);

	if (segments.length < 2) {
		return undefined;
	}

	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/i, "");
	const namePattern = /^[A-Za-z0-9_.-]+$/;

	if (!namePattern.test(owner) || !namePattern.test(repo) || !repo) {
		return undefined;
	}

	return { owner, repo };
}

/**
 * A manifest-declared path must stay inside the plugin directory:
 * relative, `/` separators, no `..`, no leading `/`, no `\`.
 * A trailing `/` (directory reference, e.g. `assets/`) is allowed.
 */
export function isSafePluginPath(path: string): boolean {
	if (typeof path !== "string" || path.length === 0) {
		return false;
	}

	if (path.includes("\\") || path.includes("\0")) {
		return false;
	}

	const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;

	if (trimmed.length === 0 || trimmed.startsWith("/")) {
		return false;
	}

	return trimmed
		.split("/")
		.every(
			(segment) => segment !== "" && segment !== "." && segment !== "..",
		);
}

const asArray = <T>(value: T | T[] | undefined): T[] => {
	if (value === undefined || value === null) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
};

/**
 * Validate a parsed garden-plugin.json for installation. Returns the typed
 * manifest, or a list of human-readable problems.
 */
export function validateGardenPluginManifest(
	parsed: unknown,
	options: { allowFirstParty?: boolean } = {},
): { manifest?: GardenPluginManifest; errors: string[] } {
	const errors: string[] = [];

	if (typeof parsed !== "object" || parsed === null) {
		return { errors: ["garden-plugin.json is not a JSON object"] };
	}

	const manifest = parsed as GardenPluginManifest;

	for (const field of REQUIRED_FIELDS) {
		if (typeof manifest[field] !== "string" || !manifest[field]) {
			errors.push(`missing required field "${field}"`);
		}
	}

	if (typeof manifest.id === "string" && !ID_PATTERN.test(manifest.id)) {
		errors.push(
			`invalid id "${manifest.id}" (lowercase letters, digits and dashes only)`,
		);
	}

	if (
		!options.allowFirstParty &&
		typeof manifest.id === "string" &&
		manifest.id.startsWith("dg-")
	) {
		errors.push(
			`the "dg-" id prefix is reserved for plugins shipped with the template`,
		);
	}

	const declaredPaths = [
		...asArray(manifest.hooks),
		...Object.values(manifest.slots ?? {}).flatMap((files) =>
			asArray(files),
		),
		...Object.values(manifest.regions ?? {}),
		...asArray(manifest.styles),
		...asArray(manifest.scripts),
		...asArray(manifest.assets),
	];

	for (const declared of declaredPaths) {
		if (!isSafePluginPath(declared)) {
			errors.push(`unsafe path "${declared}" in manifest`);
		}
	}

	if (errors.length > 0) {
		return { errors };
	}

	return { manifest, errors };
}

/**
 * Repo files that have no runtime purpose and are skipped at install time.
 */
export function shouldSkipRepoFile(path: string): boolean {
	const firstSegment = path.split("/")[0];

	return (
		firstSegment.startsWith(".git") ||
		firstSegment === ".github" ||
		firstSegment === "node_modules"
	);
}
