import type DigitalGardenSettings from "../models/settings";
import { PublishPlatform } from "../models/PublishPlatform";

/** Backward-compatible destinations used when no custom path is configured. */
export const NOTE_PATH_BASE = "src/site/notes/";
export const IMAGE_PATH_BASE = "src/site/img/user/";

type RepositoryPathSettings = Pick<
	DigitalGardenSettings,
	| "publishPlatform"
	| "notesDirectory"
	| "assetsDirectory"
	| "siteDirectory"
	| "settingsFilePath"
>;

/** Normalize a safe repository-relative directory to exactly one trailing slash. */
export function normalizeRepoDirectory(value?: string): string {
	const normalized = normalizeRepoPath(value);

	return normalized ? `${normalized}/` : "";
}

/** Normalize a safe repository-relative path. Invalid/traversing paths are rejected. */
export function normalizeRepoPath(value?: string): string {
	const stripped = (value ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "")
		.replace(/\/{2,}/g, "/");

	if (!stripped) return "";

	if (
		stripped
			.split("/")
			.some((segment) => segment === "." || segment === "..")
	) {
		return "";
	}

	return stripped;
}

function customDirectory(
	settings: RepositoryPathSettings,
	configured: string | undefined,
	fallback: string,
): string {
	if (settings.publishPlatform === PublishPlatform.ForestryMd)
		return fallback;

	return normalizeRepoDirectory(configured) || fallback;
}

export function notePathBase(settings: RepositoryPathSettings): string {
	return customDirectory(settings, settings.notesDirectory, NOTE_PATH_BASE);
}

export function imagePathBase(settings: RepositoryPathSettings): string {
	return customDirectory(settings, settings.assetsDirectory, IMAGE_PATH_BASE);
}

export function imageHashKey(assetPath: string): string {
	return assetPath.replace(/^\/img\/user\//, "");
}

export function sitePath(
	settings: RepositoryPathSettings,
	sub: string,
): string {
	const root = customDirectory(settings, settings.siteDirectory, "src/site/");

	return `${root}${sub.replace(/^\/+/, "")}`;
}

export function envPath(settings: RepositoryPathSettings): string {
	if (settings.publishPlatform !== PublishPlatform.ForestryMd) {
		const custom = normalizeRepoPath(settings.settingsFilePath);

		if (custom) return custom;
	}

	return ".env";
}
