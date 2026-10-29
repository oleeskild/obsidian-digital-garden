import type { SiteChange } from "./siteChanges";
import { themeFromCssUrl, type ThemeInfo } from "./siteFields";

const truncate = (s: string, max = 40) =>
	s.length > max ? `${s.slice(0, max - 1)}…` : s;

/** A setting value as a short phrase for the change line. */
export function formatValue(
	change: SiteChange,
	value: string,
	themes: ThemeInfo[],
): string {
	const kind = change.field?.kind;

	if (kind === "bool") return value === "true" ? "on" : "off";

	if (kind === "theme") {
		return value ? themeFromCssUrl(value, themes).name : "default theme";
	}

	if (kind === "styleSettings") {
		const parts = JSON.parse(value) as string[];

		return parts.some(Boolean) ? "captured styles" : "none";
	}

	if (!value) return change.keys.length === 0 ? "none" : "not set";

	return `“${truncate(value)}”`;
}
