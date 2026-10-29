import { requestUrl } from "obsidian";
import type { ThemeInfo } from "./siteFields";

const OBSIDIAN_THEME_URL =
	"https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json";

interface CommunityTheme {
	name: string;
	repo: string;
	screenshot: string;
	modes: string[];
	legacy: boolean;
	branch?: string;
}

export interface PickableTheme extends ThemeInfo {
	screenshotUrl: string;
}

// Download counts per theme name, from Forestry.md.
const THEME_STATS_URL = "https://dashboard.forestry.md/theme-stats";

type ThemeStats = Record<string, { download?: number }>;

/** Download counts, or none if the stats can't be loaded. */
const loadThemeStats = (): Promise<ThemeStats> =>
	requestUrl(THEME_STATS_URL)
		.then((res) => res.json as ThemeStats)
		.catch(() => ({}));

/** Most downloaded first; themes without stats follow, by name. */
export function sortByPopularity<T extends { name: string }>(
	themes: T[],
	stats: ThemeStats,
): T[] {
	const downloads = (t: T) => stats[t.name]?.download ?? 0;

	return [...themes].sort(
		(a, b) => downloads(b) - downloads(a) || a.name.localeCompare(b.name),
	);
}

let cached: Promise<PickableTheme[]> | null = null;

/**
 * Obsidian's community theme list, most popular first, fetched once per
 * session.
 */
export function loadThemes(): Promise<PickableTheme[]> {
	cached ??= Promise.all([
		requestUrl(OBSIDIAN_THEME_URL).then(
			(res) => res.json as CommunityTheme[],
		),
		loadThemeStats(),
	])
		.then(([themes, stats]) =>
			sortByPopularity(
				themes.map((t) => {
					const base = `https://raw.githubusercontent.com/${t.repo}/${
						t.branch || "HEAD"
					}`;

					return {
						name: t.name,
						repo: t.repo,
						modes: t.modes,
						cssUrl: `${base}/${
							t.legacy ? "obsidian.css" : "theme.css"
						}`,
						screenshotUrl: `${base}/${t.screenshot}`,
					};
				}),
				stats,
			),
		)
		.catch((error) => {
			cached = null;
			throw error;
		});

	return cached;
}
