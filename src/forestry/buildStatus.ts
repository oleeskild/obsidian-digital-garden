import type { IDeployInfo } from "./DeployInfo";

/**
 * Build states in the Forestry.md dashboard's words, so a garden reads the
 * same in Obsidian and on forestry.md (dashboard: features/garden/status.ts).
 * "Building" is deliberate: everywhere else it's a publish, but a run in
 * flight is a build.
 */
export type BuildTone =
	| "muted"
	| "info"
	| "success"
	| "warning"
	| "destructive";

export interface BuildStatus {
	label: "Queued" | "Building" | "Published" | "Cancelled" | "Failed";
	tone: BuildTone;
}

const QUEUED = new Set(["queued", "pending", "waiting"]);
const RUNNING = new Set(["in_progress", "inprogress"]);

export function deriveBuildStatus(build: IDeployInfo): BuildStatus {
	const status = build.status?.toLowerCase() ?? "";
	const conclusion = build.conclusion?.toLowerCase() ?? "";

	if (QUEUED.has(status)) return { label: "Queued", tone: "info" };

	if (RUNNING.has(status)) return { label: "Building", tone: "info" };

	// Routine: a newer publish replaced it. Nothing to look at.
	if (status === "cancelled" || conclusion === "cancelled") {
		return { label: "Cancelled", tone: "muted" };
	}

	if (status === "failed") return { label: "Failed", tone: "destructive" };

	if (conclusion === "success") {
		return { label: "Published", tone: "success" };
	}

	// A finished build with any other conclusion (or none), and anything we
	// don't recognise, is worth a look; as on the dashboard.
	return { label: "Failed", tone: "destructive" };
}

export const isRunning = (build: IDeployInfo) =>
	["Queued", "Building"].includes(deriveBuildStatus(build).label);

export const isDraftBuild = (build: IDeployInfo) =>
	build.branch?.toLowerCase().startsWith("draft") ?? false;

/** How many builds the plugin asks for; fewer back means the full history. */
export const BUILD_HISTORY_LIMIT = 10;

/**
 * The run that set the garden up when it was planted: its first production
 * build, which publishes an empty site. Only knowable while the whole
 * history fits in one response (dashboard: plantingRun). It isn't a
 * publish, so it never reads as one.
 */
export function plantingBuild(
	builds: IDeployInfo[],
	limit = BUILD_HISTORY_LIMIT,
): IDeployInfo | undefined {
	if (builds.length >= limit) return undefined;

	const production = builds.filter((b) => !isDraftBuild(b));
	const first = production[production.length - 1];

	return first?.hasHomePage === false ? first : undefined;
}

/**
 * The newest production publish that worked: what visitors see now. The
 * planting run doesn't count; a garden with only that isn't live.
 */
export function liveBuild(builds: IDeployInfo[]): IDeployInfo | undefined {
	const planting = plantingBuild(builds);

	return builds.find(
		(b) =>
			b !== planting &&
			deriveBuildStatus(b).label === "Published" &&
			!isDraftBuild(b),
	);
}

export function secondsSince(iso: string, now = Date.now()): number {
	const started = new Date(iso).getTime();

	if (Number.isNaN(started)) return 0;

	return Math.max(0, Math.floor((now - started) / 1000));
}

/** 42s, 1m 5s, 2h 3m. Past an hour the seconds are noise. */
export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;

	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

	if (minutes > 0) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;

	return `${secs}s`;
}

export function timeAgo(iso: string, now = Date.now()): string {
	const seconds = secondsSince(iso, now);

	if (seconds < 60) return "just now";

	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

	return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * What a build in flight says (from the dashboard). A minute is long enough
 * for a static "Building…" to feel stuck.
 */
export const GARDENING_MESSAGES = [
	"Planting your ideas…",
	"Watering the pixels…",
	"Growing your garden…",
	"Pruning the code…",
	"Tending to your notes…",
	"Cultivating knowledge…",
	"Sprouting new pages…",
	"Pollinating links…",
	"Arranging the flowers…",
	"Trimming the hedges…",
	"Raking the leaves…",
	"Planting new seeds…",
	"Training the vines…",
	"Spreading fresh mulch…",
	"Transplanting seedlings…",
] as const;

export const GARDENING_MESSAGE_MS = 15_000;

/** The site's address for display: no scheme, no trailing slash. */
export const displayHost = (url: string) =>
	url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

/** A full URL for opening, adding https:// when the address has no scheme. */
export const siteHref = (url: string) =>
	/^https?:\/\//.test(url) ? url : `https://${url}`;

export interface SiteStatus {
	label:
		| "Not published yet"
		| "Queued"
		| "Building"
		| "Live"
		| "Live, no home page"
		| "Last publish failed"
		| "Last publish cancelled";
	tone: BuildTone;
}

/**
 * The garden as a whole, in the dashboard header's words (gardenStatus),
 * for the status bar. A garden that's only been planted isn't live.
 */
export function siteStatus(builds: IDeployInfo[]): SiteStatus {
	const latest = builds[0];

	if (!latest) return { label: "Not published yet", tone: "muted" };

	const run = deriveBuildStatus(latest).label;

	if (run === "Queued" || run === "Building") {
		return { label: run, tone: "info" };
	}

	if (run === "Failed") {
		return { label: "Last publish failed", tone: "destructive" };
	}

	if (run === "Cancelled") {
		return { label: "Last publish cancelled", tone: "muted" };
	}

	const live = liveBuild(builds);

	if (!live) return { label: "Not published yet", tone: "muted" };

	return live.hasHomePage === false
		? { label: "Live, no home page", tone: "warning" }
		: { label: "Live", tone: "success" };
}

/** What a build did, as a short sentence (the dashboard row's headline). */
export function buildHeadline(
	build: IDeployInfo,
	planting: IDeployInfo | undefined,
): string {
	const status = deriveBuildStatus(build).label;

	if (build === planting) return "Garden planted, waiting for its first note";

	switch (status) {
		case "Queued":
			return "Waiting for the build to start";
		case "Building":
			return "Building your site";
		case "Published":
			return "Notes published";
		case "Cancelled":
			return "Replaced by a newer publish";
		default:
			return (
				headlineText(build.friendlyError?.message) ?? "Publish failed"
			);
	}
}

/** "Oct 27, 14:05": the full time behind a relative one. */
export const fullDate = (iso: string) =>
	new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

/** A row's time: relative within a day, then a short date. */
export function shortWhen(iso: string, now = Date.now()): string {
	if (secondsSince(iso, now) < 86400) return timeAgo(iso, now);

	const date = new Date(iso);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: sameYear ? undefined : "numeric",
	});
}

/**
 * Forestry.md's messages end with a period; headlines here don't.
 */
export function headlineText(message: string | undefined): string | undefined {
	return message?.trim().replace(/\.$/, "");
}
