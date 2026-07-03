import type DigitalGardenSettings from "../models/settings";

/**
 * Un-prefixed suffixes describing the Eleventy garden template layout.
 * These are relative to the (optional) {@link normalizeContentBaseDir content base directory}
 * and are never used directly to build repo paths — always go through the builders below.
 */
export const NOTE_PATH_BASE = "src/site/notes/";
export const IMAGE_PATH_BASE = "src/site/img/user/";

/** Only the field the path builders actually depend on. */
type ContentBaseSettings = Pick<DigitalGardenSettings, "contentBaseDir">;

/**
 * Normalize the configured content base directory into a repo-path prefix.
 *
 * - `undefined` / `""` / `"/"` → `""` (no prefix — the repo root, current behavior)
 * - `"Web"` / `"/Web/"` / `"  Web  "` → `"Web/"`
 * - `"a/b"` → `"a/b/"`
 *
 * The result never has a leading `/` and always ends with exactly one `/` when non-empty,
 * so concatenating it with a suffix never produces `//` or a leading `/`.
 */
export function normalizeContentBaseDir(base?: string): string {
	// Strip surrounding whitespace and all leading/trailing slashes, then re-append a
	// single trailing slash. Empty, "/", "//" etc. collapse to "" (the repo root).
	const stripped = (base ?? "")
		.trim()
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");

	return stripped === "" ? "" : `${stripped}/`;
}

/** Normalized content base prefix derived from the settings (`""` or e.g. `"Web/"`). */
export function contentBaseDir(settings: ContentBaseSettings): string {
	return normalizeContentBaseDir(settings.contentBaseDir);
}

/** Repo path to the notes directory, e.g. `src/site/notes/` or `Web/src/site/notes/`. */
export function notePathBase(settings: ContentBaseSettings): string {
	return `${contentBaseDir(settings)}${NOTE_PATH_BASE}`;
}

/** Repo path to the user image directory, e.g. `src/site/img/user/`. */
export function imagePathBase(settings: ContentBaseSettings): string {
	return `${contentBaseDir(settings)}${IMAGE_PATH_BASE}`;
}

/**
 * Repo path inside `src/site`, e.g. `sitePath(settings, "/logo.png")` → `src/site/logo.png`.
 * `sub` is expected to begin with `/`.
 */
export function sitePath(settings: ContentBaseSettings, sub: string): string {
	return `${contentBaseDir(settings)}src/site${sub}`;
}

/** Repo path to the garden `.env` file, e.g. `.env` or `Web/.env`. */
export function envPath(settings: ContentBaseSettings): string {
	return `${contentBaseDir(settings)}.env`;
}
