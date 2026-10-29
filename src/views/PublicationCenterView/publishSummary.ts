import type { PublishPlan } from "./annotate";

export interface PublishSummary {
	publishCount: number;
	removeCount: number;
	/** Paths that will be removed from the live site, notes first. */
	removePaths: string[];
	/** Site settings (theme, note display, …) ticked for publishing. */
	siteCount: number;
}

export function summarizePlan(
	plan: PublishPlan,
	siteCount = 0,
): PublishSummary {
	const removePaths = [...plan.notesToDelete, ...plan.imagesToDelete];

	return {
		publishCount: plan.notesToPublish.length,
		removeCount: removePaths.length,
		removePaths,
		siteCount,
	};
}

/** Keep only the selected paths the user can currently see. */
export function visibleSelection(
	selected: Set<string>,
	visiblePaths: string[],
): Set<string> {
	return new Set(visiblePaths.filter((p) => selected.has(p)));
}

const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;

/** Short button text, e.g. "Publish 6 · Remove 2 · Site 3". */
export function publishButtonLabel(s: PublishSummary): string {
	const parts = [
		s.publishCount > 0 ? `Publish ${s.publishCount}` : "",
		s.removeCount > 0 ? `Remove ${s.removeCount}` : "",
		s.siteCount > 0 ? `Site ${s.siteCount}` : "",
	].filter(Boolean);

	if (parts.length === 0) return "Publish";

	// Site changes alone still read as a publish.
	if (parts.length === 1 && s.siteCount > 0) {
		return `Publish ${plural(
			s.siteCount,
			"site setting",
			"site settings",
		)}`;
	}

	return parts.join(" · ");
}

/** Full sentence for screen readers and tooltips. */
export function publishButtonDescription(s: PublishSummary): string {
	const parts = [
		s.publishCount > 0
			? `publish ${plural(s.publishCount, "note", "notes")}`
			: "",
		s.removeCount > 0
			? `remove ${plural(s.removeCount, "file", "files")} from your site`
			: "",
		s.siteCount > 0
			? `publish ${plural(s.siteCount, "site setting", "site settings")}`
			: "",
	].filter(Boolean);

	if (parts.length === 0) return "Publish";

	const sentence =
		parts.length === 1
			? parts[0]
			: `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

	return sentence[0].toUpperCase() + sentence.slice(1);
}

const fileName = (path: string) => path.split("/").pop() ?? path;

/** "a, b and c", with "and N more" past what's shown. */
function joinNames(names: string[], rest: number): string {
	if (rest > 0) return `${names.join(", ")} and ${rest} more`;

	if (names.length <= 1) return names.join("");

	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "a.md, b.md and 3 more" — at most `max` names. */
export function listNames(paths: string[], max = 3): string {
	const names = paths.slice(0, max).map(fileName);

	return joinNames(names, paths.length - names.length);
}

/**
 * What's being removed and why: "a.md and b.md: unpublished" when they
 * share a reason, else "a.md (unpublished) and b.md (not in your vault)".
 */
export function describeRemovals(
	paths: string[],
	reasonOf: (path: string) => string,
	max = 3,
): string {
	const reasons = new Set(paths.map(reasonOf));

	if (reasons.size <= 1) {
		return `${listNames(paths, max)}: ${[...reasons][0] ?? ""}`;
	}

	const names = paths
		.slice(0, max)
		.map((p) => `${fileName(p)} (${reasonOf(p)})`);

	return joinNames(names, paths.length - names.length);
}

/**
 * A large removal said as a share of the site, so it can't pass for a
 * small one: "That's 40 of your 52 published notes." Null when small.
 */
export function describeRemovalShare(
	removed: number,
	live: number,
): string | null {
	if (live <= 0 || removed <= 0) return null;

	if (removed >= live) return "That's every note on your site.";

	const large = removed >= 20 || (removed >= 3 && removed * 4 >= live);

	return large ? `That's ${removed} of your ${live} published notes.` : null;
}
