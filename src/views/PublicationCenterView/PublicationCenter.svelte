<script lang="ts">
	import { onMount } from "svelte";
	import { readable, writable } from "svelte/store";
	import { isRunning } from "../../forestry/buildStatus";
	import type { App } from "obsidian";
	import type DigitalGardenSettings from "../../models/settings";
	import SiteTab from "./site/SiteTab.svelte";
	import { setSiteContext } from "./site/siteContext";
	import type { CenterTarget, SiteTabSection } from "./site/target";
	import { computeSiteChanges } from "./site/siteChanges";
	import type { SiteChange } from "./site/siteChanges";
	import { applySiteValue } from "./site/siteFields";
	import type { ThemeInfo } from "./site/siteFields";
	import {
		assetChanges,
		assetOf,
		localSiteValues,
		navigationChange,
		navigationJson,
		publishSiteChanges,
		pullFromSite,
		siteFieldsFor,
		themeBlockReason,
	} from "./site/siteSync";
	import { loadThemes } from "./site/themes";
	import { Notice, Platform } from "obsidian";
	import Publisher from "../../publisher/Publisher";
	import { LimitReachedError } from "../../forestry/LimitReachedError";
	import { PublishBranchMissingError } from "../../repositoryConnection/PublishBranchMissingError";
	import { notifyPublishBranchMissing } from "../../repositoryConnection/publishBranchNotice";
	import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
	import type {
		IPublishStatusManager,
		PublishStatus,
	} from "../../publisher/PublishStatusManager";
	import {
		annotateFiles,
		defaultSelection,
		buildPublishPlan,
	} from "./annotate";
	import type { AnnotatedFile, FileStatus } from "./annotate";
	import {
		buildFileTree,
		collectSelectablePaths,
		filterTree,
	} from "./fileTree";
	import {
		describeRemovalShare,
		summarizePlan,
		visibleSelection,
	} from "./publishSummary";
	import { describeLoadError } from "./loadError";
	import type { LoadErrorMessage } from "./loadError";
	import { indeterminate } from "./checkboxState";
	import * as Diff from "diff";
	import Icon from "../../ui/Icon.svelte";
	import StatusFilters from "./StatusFilters.svelte";
	import FileTree from "./FileTree.svelte";
	import DiffPane from "./DiffPane.svelte";
	import Notices from "./Notices.svelte";
	import PublishBar from "./PublishBar.svelte";
	import RecentBuilds from "./RecentBuilds.svelte";
	import Tutorial, { isTutorialPending } from "./Tutorial.svelte";
	import type { SiteUpdateTracker } from "../../forestry/SiteUpdateTracker";
	import Logger from "js-logger";
	import { describeError, getDebugLog } from "../../utils/debugLog";

	export let siteManager: DigitalGardenSiteManager;
	export let publisher: Publisher;
	export let statusManager: IPublishStatusManager;
	export let openFile: (path: string) => void;
	export let siteUpdateTracker: SiteUpdateTracker | null = null;
	/** Null when the garden isn't on Forestry.md (no banner). */
	export let homePageMissing: (() => boolean) | null = null;
	export let onChooseHomePage: () => void = () => {};
	export let onOpenSettings: () => void = () => {};
	export let app: App;
	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let initialTarget: CenterTarget = { tab: "notes" };
	let showHomePageBanner = false;
	export let registerApi: (api: {
		maybeRefresh: () => void;
		show: (target: CenterTarget) => void;
	}) => void = () => {};

	const DISCORD_URL = "https://discord.gg/UsPH74nEVS";

	// The site-update tracker only exists for gardens on Forestry.md.
	$: isForestry = siteUpdateTracker !== null;

	let status: PublishStatus | null = null;
	let loadError: LoadErrorMessage | null = null;
	let refreshing = false;
	let lastRefreshAt = 0;
	const REFRESH_DEBOUNCE_MS = 3000;
	let annotated: AnnotatedFile[] = [];
	let selected = new Set<string>();
	// "published" (already in sync) is hidden by default so the view focuses
	// on notes that need action; the user can toggle it on via the chip.
	let activeFilters = new Set<FileStatus>(["changed", "new", "deleted"]);
	let activePath: string | null = null;
	let tutorialVisible = isTutorialPending();

	type DiffData =
		| { kind: "diff"; changes: Diff.Change[] }
		| { kind: "nochange" }
		| { kind: "image" }
		| { kind: "error"; message: string };

	let problematicFiles: { path: string; issue: string }[] = [];
	let publishing = false;
	let publishError: string | null = null;
	/** What did reach the site when a publish only partly failed. */
	let publishPartial: string | null = null;
	let limitError: LimitReachedError | null = null;
	let lastResult: {
		published: number;
		removed: number;
		site: number;
	} | null = null;
	let progressTotal = 0;
	let progressDone = 0;
	// The first total is an estimate; counts only show once the publisher
	// reports its real step count, so the number never jumps backwards.
	let progressKnown = false;
	let progressCurrent = "";

	const copyPublishErrorDetails = async () => {
		const details = [
			"Digital Garden publish error",
			"",
			publishError ?? "(no error message)",
			"",
			"--- Recent plugin log ---",
			getDebugLog(),
		].join("\n");

		await navigator.clipboard.writeText(details);
		new Notice("Error details copied to clipboard.");
	};

	const copyLoadErrorDetails = async () => {
		await navigator.clipboard.writeText(
			[
				"Digital Garden load error",
				"",
				loadError?.detail ?? "",
				"",
				"--- Recent plugin log ---",
				getDebugLog(),
			].join("\n"),
		);
		new Notice("Error details copied to clipboard.");
	};

	// Reads fell back to the default branch; publishing would fail on the
	// missing branch, so it is blocked until a refresh finds the branch.
	$: missingBranch = status?.missingPublishBranch ?? null;

	// Side-by-side is unreadable on a phone-sized screen, so mobile starts
	// in unified mode. The user can still switch.
	let diffMode: "split" | "unified" = Platform.isMobile ? "unified" : "split";
	let diffCache = new Map<string, DiffData>();
	let diffData: DiffData | null = null;
	let diffLoading = false;

	$: activeFile = annotated.find((f) => f.path === activePath) ?? null;

	$: tree = buildFileTree(annotated);
	$: visibleTree = filterTree(tree, activeFilters) ?? {
		name: "",
		path: "",
		isFolder: true,
		children: [],
	};

	// What you see is what ships: "Select all", the publish button and the
	// publish itself all act on the files the status filters show.
	// Published notes have nothing to publish, so they are never counted.
	$: visiblePaths = collectSelectablePaths(visibleTree);
	$: visibleSet = new Set(visiblePaths);
	$: visibleSelectedCount = visiblePaths.filter((p) =>
		selected.has(p),
	).length;
	$: allVisibleSelected =
		visiblePaths.length > 0 && visibleSelectedCount === visiblePaths.length;
	$: someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

	$: plan = buildPublishPlan(
		visibleSelection(selected, visiblePaths),
		annotated,
	);
	$: summary = summarizePlan(plan, siteReady.length);
	$: hiddenSelectedCount = annotated.filter(
		(f) =>
			f.status !== "published" &&
			selected.has(f.path) &&
			!visibleSet.has(f.path),
	).length;

	// ── Site settings ──────────────────────────────────────────────────
	// The site is the source of truth: its values are pulled in on load.
	// Edits save locally right away and show as pending site changes; the
	// shared publish bar writes the ticked ones to the site.

	/**
	 * A note named in a build error, as a vault path. Errors use garden
	 * paths, which differ when notes are rewritten, so fall back to Obsidian's
	 * link resolution by name.
	 */
	function findVaultNote(path: string): string | null {
		const exact = app.vault.getAbstractFileByPath(path);

		if (exact) return exact.path;

		return (
			app.metadataCache.getFirstLinkpathDest(
				path.replace(/\.md$/, ""),
				"",
			)?.path ?? null
		);
	}

	// Forestry only: the quota and a build in flight shape the publish bar.
	const siteUpdates = siteUpdateTracker?.store ?? readable(null);

	$: buildsLeft = $siteUpdates?.limits?.builds.monthlyRemaining ?? null;

	$: outOfPublishes = buildsLeft === 0;

	$: outOfPublishesReason = (() => {
		const reset = $siteUpdates?.limits?.builds.nextReset;

		const date = reset
			? new Date(reset).toLocaleDateString(undefined, {
					month: "short",
					day: "numeric",
			  })
			: null;

		return `No publishes left this month.${
			date ? ` More on ${date}.` : ""
		}`;
	})();

	$: buildRunning =
		!!$siteUpdates &&
		($siteUpdates.awaitingNewBuild ||
			($siteUpdates.builds[0] !== undefined &&
				isRunning($siteUpdates.builds[0])));

	let rootEl: HTMLElement | undefined;
	let activeTab: "notes" | "site" = initialTarget.tab;
	let siteSection: SiteTabSection = initialTarget.section ?? "appearance";
	let sitePluginId = initialTarget.pluginId;

	function show(target: CenterTarget) {
		activeTab = target.tab;

		if (target.section) siteSection = target.section;
		sitePluginId = target.pluginId;
	}
	let siteLoaded = false;
	let siteLoading = false;
	let siteError: string | null = null;
	let siteFormVersion = 0;
	const siteChanges = writable(new Map<string, SiteChange>());
	const siteThemes = writable<ThemeInfo[]>([]);

	function recomputeSite() {
		if (!siteLoaded) return;

		const blocked = themeBlockReason(settings);

		const changes = [
			...computeSiteChanges(
				siteFieldsFor(settings),
				localSiteValues(settings),
				settings.siteSettingsBaseline ?? {},
			),
			...assetChanges(settings),
			...navigationChange(settings),
		].map((c) =>
			// Both are held; the reason shows once, on Light or dark.
			blocked && c.id === "BASE_THEME"
				? { ...c, blockedReason: blocked }
				: blocked && c.id === "THEME"
				? {
						...c,
						blockedReason: "Held back until Light or dark matches.",
				  }
				: c,
		);

		siteChanges.set(new Map(changes.map((c) => [c.id, c])));
	}

	async function loadSite() {
		siteLoading = !siteLoaded;
		siteError = null;

		try {
			const snapshot = () =>
				JSON.stringify(localSiteValues(settings)) +
				navigationJson(settings.navigationOrder);
			const before = snapshot();

			if (await pullFromSite(siteManager, settings, $siteThemes)) {
				await saveSettings();
			}
			siteLoaded = true;

			// Show values that came from the site in the form controls.
			if (snapshot() !== before) {
				siteFormVersion++;
			}
			recomputeSite();
		} catch (e) {
			siteError = describeLoadError(e, isForestry).title + ".";
		} finally {
			siteLoading = false;
		}

		loadThemes()
			.then((themes) => siteThemes.set(themes))
			.catch(() => {});
	}

	async function editSite() {
		await saveSettings();
		recomputeSite();
	}

	async function revertSiteChange(change: SiteChange) {
		for (const [key, value] of Object.entries(change.remoteValues)) {
			applySiteValue(settings, key, value, $siteThemes);
		}

		if (change.id === "navigation") {
			settings.navigationOrder = change.remote
				? JSON.parse(change.remote)
				: undefined;
		}

		const asset = assetOf(change);

		if (asset && settings.siteAssetBaseline) {
			if (asset === "logo") {
				settings.logoPath = settings.siteAssetBaseline.logoPath;
			} else {
				settings.faviconPath = settings.siteAssetBaseline.faviconPath;
			}
		}

		await saveSettings();
		recomputeSite();
		siteFormVersion++;
	}

	setSiteContext({
		app,
		settings,
		saveSettings,
		notifySiteChanged: () => siteUpdateTracker?.notifyPublished(),
		get isForestry() {
			return siteUpdateTracker !== null;
		},
		changes: siteChanges,
		themes: siteThemes,
		edit: editSite,
		revert: revertSiteChange,
	});

	$: siteCount = $siteChanges.size;
	// Every edit goes out with the next publish, except one that can't be
	// published as it is; Revert is how to leave one out.
	$: siteReady = [...$siteChanges.values()].filter((c) => !c.blockedReason);

	async function loadStatus({ background = false, manual = false } = {}) {
		if (refreshing) return;
		refreshing = true;

		const prevAllPaths = new Set(annotated.map((f) => f.path));
		const prevSelected = selected;

		if (background) {
			// Keep the current tree on screen and re-fetch quietly; only the
			// diff cache is dropped so re-opening a file pulls fresh content.
			diffCache = new Map();
		} else {
			diffCache = new Map();
			diffData = null;
			diffLoading = false;
			activePath = null;
			loadError = null;
			status = null;
		}

		try {
			const s = await statusManager.getPublishStatus();
			status = s;
			annotated = annotateFiles(s);

			selected = background
				? mergeSelection(prevSelected, prevAllPaths, annotated)
				: defaultSelection(annotated);
			validate(s);
			loadSite();
			lastRefreshAt = Date.now();

			// Drop the open diff if its file no longer exists.
			if (activePath && !annotated.some((f) => f.path === activePath)) {
				activePath = null;
				diffData = null;
			}
		} catch (e) {
			if (!background) {
				loadError = describeLoadError(e, isForestry);
			} else if (manual) {
				new Notice(
					`Couldn't refresh: ${
						describeLoadError(e, isForestry).title
					}.`,
				);
			} else {
				// eslint-disable-next-line no-undef
				console.error(
					"Publication Center: background refresh failed",
					e,
				);
			}
		} finally {
			refreshing = false;
		}
	}

	// Full load with the loading state; used on first open and to retry
	// after a failed load.
	function reload() {
		return loadStatus({ background: false });
	}

	// Manual Refresh: re-fetch in place, keeping the user's selection.
	function refresh() {
		lastResult = null;

		if (!status) return reload();

		return loadStatus({ background: true, manual: true });
	}

	// Quiet, debounced refresh that keeps the tree visible and preserves the
	// user's current checkbox selection. Called when the view becomes active.
	function maybeRefresh() {
		if (refreshing) return;

		if (Date.now() - lastRefreshAt < REFRESH_DEBOUNCE_MS) return;
		loadStatus({ background: true });
		siteUpdateTracker?.refresh();
	}

	// Keep the user's choices for files that still exist; default-select any
	// newly appeared actionable file.
	function mergeSelection(
		prevSelected: Set<string>,
		prevAllPaths: Set<string>,
		files: AnnotatedFile[],
	): Set<string> {
		const next = new Set<string>();

		for (const f of files) {
			if (prevAllPaths.has(f.path)) {
				if (prevSelected.has(f.path)) next.add(f.path);
			} else if (f.status !== "published") {
				next.add(f.path);
			}
		}

		return next;
	}

	function validate(s: PublishStatus) {
		problematicFiles = [];
		showHomePageBanner = homePageMissing?.() ?? false;

		const homeFiles = [
			...s.publishedNotes,
			...s.unpublishedNotes,
			...s.changedNotes,
		].filter((n) => n.frontmatter && n.frontmatter["dg-home"] === true);

		if (homeFiles.length > 1) {
			problematicFiles = homeFiles.map((f) => ({
				path: f.getPath(),
				issue: "Marked as home page (dg-home: true). Keep it on one note only.",
			}));
		}
	}

	const countPhrase = (n: number, one: string, many: string) =>
		`${n} ${n === 1 ? one : many}`;

	function resultSentence(r: {
		published: number;
		removed: number;
		site: number;
	}) {
		const parts = [
			r.published > 0
				? `published ${countPhrase(r.published, "note", "notes")}`
				: "",
			r.removed > 0
				? `removed ${countPhrase(r.removed, "file", "files")}`
				: "",
			r.site > 0
				? `updated ${countPhrase(
						r.site,
						"site setting",
						"site settings",
				  )}`
				: "",
		].filter(Boolean);

		const text =
			parts.length === 1
				? parts[0]
				: `${parts.slice(0, -1).join(", ")} and ${
						parts[parts.length - 1]
				  }`;

		return `${text[0].toUpperCase()}${text.slice(1)}.`;
	}

	async function publishSelected() {
		if (missingBranch) return;

		const runPlan = plan;

		const deletesTotal =
			runPlan.notesToDelete.length + runPlan.imagesToDelete.length;

		// Provisional total; the batch publish reports its real step count
		// (blob uploads incl. images + the commit) via onProgress below.
		const siteRun = siteReady;
		const siteSteps = siteRun.length > 0 ? 1 : 0;

		progressTotal =
			runPlan.notesToPublish.length + deletesTotal + siteSteps;

		if (progressTotal === 0) return;

		let sitePublished = 0;

		// Track what actually succeeded so we can update the view immediately
		// without waiting for the backend's git tree to catch up — it is
		// eventually consistent and lags a publish by a second or two, so an
		// immediate re-fetch would still report the just-published notes as
		// "changed". The manual Refresh button re-syncs authoritative state.
		const publishedPaths = new Set<string>();
		const removedPaths = new Set<string>();
		let hadFailure = false;
		publishing = true;
		publishError = null;
		publishPartial = null;
		limitError = null;
		lastResult = null;
		progressDone = 0;
		progressKnown = false;

		try {
			let batchSteps = runPlan.notesToPublish.length;

			// A site-only or removal-only publish skips the note upload.
			if (runPlan.notesToPublish.length > 0) {
				progressCurrent = "Preparing upload…";

				const batchResult = await publisher.publishBatch(
					runPlan.notesToPublish,
					(done, total, message) => {
						batchSteps = total;
						progressTotal = total + deletesTotal + siteSteps;
						progressDone = done;
						progressKnown = true;
						progressCurrent = message;
					},
				);
				progressDone = batchSteps;

				if (batchResult.success) {
					for (const note of runPlan.notesToPublish) {
						publishedPaths.add(note.getPath());
					}
				} else {
					hadFailure = true;
					publishError = batchResult.error ?? "Unknown error";
				}
			}

			if (deletesTotal > 0) {
				const deleteResult = await publisher.deleteBatch(
					runPlan.notesToDelete,
					runPlan.imagesToDelete,
					(done, total, message) => {
						progressTotal = batchSteps + total + siteSteps;
						progressDone = batchSteps + done;
						progressKnown = true;
						progressCurrent = message;
					},
				);

				if (deleteResult.success) {
					for (const path of runPlan.notesToDelete) {
						removedPaths.add(path);
					}

					for (const path of runPlan.imagesToDelete) {
						removedPaths.add(path);
					}
				} else {
					hadFailure = true;

					publishError = [publishError, deleteResult.error]
						.filter(Boolean)
						.join("\n");
				}
			}

			if (siteRun.length > 0) {
				progressCurrent = "Updating site settings…";
				progressKnown = true;

				try {
					await publishSiteChanges({
						siteManager,
						settings,
						vault: app.vault,
						changes: siteRun,
					});
					sitePublished = siteRun.length;
				} catch (e) {
					Logger.error("Publication Center: site settings failed", e);
					hadFailure = true;

					publishError = [
						publishError,
						`Site settings: ${describeError(e)}`,
					]
						.filter(Boolean)
						.join("\n");
				} finally {
					await saveSettings();
					recomputeSite();
				}
				progressDone = progressTotal;
			}

			if (hadFailure) {
				new Notice(
					"Publishing failed. See the details in the Publication Center.",
				);
			} else {
				lastResult = {
					published: publishedPaths.size,
					removed: removedPaths.size,
					site: sitePublished,
				};

				// The result line says it here; a notice is for when the
				// user has moved on to another tab.
				if (!rootEl?.isShown()) new Notice("Publication complete.");
			}
		} catch (e) {
			if (e instanceof LimitReachedError) {
				limitError = e;
			} else if (e instanceof PublishBranchMissingError) {
				publishError = e.message;
				notifyPublishBranchMissing(e);
			} else {
				Logger.error("Publication Center: publish failed", e);
				publishError = describeError(e);

				new Notice(
					"Publishing failed. See the details in the Publication Center.",
				);
			}
		} finally {
			if (
				publishError &&
				(publishedPaths.size > 0 ||
					removedPaths.size > 0 ||
					sitePublished > 0)
			) {
				const parts = [];

				if (publishedPaths.size > 0) {
					parts.push(
						`${countPhrase(
							publishedPaths.size,
							"note was",
							"notes were",
						)} published`,
					);
				}

				if (removedPaths.size > 0) {
					parts.push(
						`${countPhrase(
							removedPaths.size,
							"file was",
							"files were",
						)} removed`,
					);
				}

				if (sitePublished > 0) {
					parts.push(
						`${countPhrase(
							sitePublished,
							"site setting was",
							"site settings were",
						)} updated`,
					);
				}
				publishPartial = parts.join(" and ");
			}

			// Reflect everything that succeeded, even if a later step threw.
			applyOptimisticUpdate(publishedPaths, removedPaths);
			publishing = false;

			// Anything that reached the repo will trigger a site update;
			// start tracking it (strip + status bar).
			if (
				publishedPaths.size > 0 ||
				removedPaths.size > 0 ||
				sitePublished > 0
			) {
				siteUpdateTracker?.notifyPublished();
			}
		}
	}

	// Move just-published notes to "published" (so they drop out of the
	// new/changed view) and drop deleted notes/images, without a backend
	// round-trip.
	function applyOptimisticUpdate(
		publishedPaths: Set<string>,
		removedPaths: Set<string>,
	) {
		if (publishedPaths.size === 0 && removedPaths.size === 0) return;

		annotated = annotated
			.filter((f) => !removedPaths.has(f.path))
			.map((f) =>
				publishedPaths.has(f.path) && f.status !== "published"
					? { ...f, status: "published" as FileStatus }
					: f,
			);

		const nextSelected = new Set(selected);
		for (const p of publishedPaths) nextSelected.delete(p);
		for (const p of removedPaths) nextSelected.delete(p);
		selected = nextSelected;

		// The open diff may now be stale (file published or removed).
		diffCache = new Map();
		diffData = null;
		diffLoading = false;
		activePath = null;
	}

	onMount(() => {
		reload();

		registerApi({
			maybeRefresh,
			show,
		});
	});

	$: counts = {
		changed: annotated.filter((f) => f.status === "changed").length,
		new: annotated.filter((f) => f.status === "new").length,
		deleted: annotated.filter((f) => f.status === "deleted").length,
		published: annotated.filter((f) => f.status === "published").length,
	} as Record<FileStatus, number>;

	$: actionableCount = counts.changed + counts.new + counts.deleted;
	// Notes on the live site now; new ones aren't there yet.
	$: liveNoteCount = annotated.filter(
		(f) => !f.isImage && f.status !== "new",
	).length;

	function toggleFilter(status: FileStatus) {
		const next = new Set(activeFilters);

		if (next.has(status)) next.delete(status);
		else next.add(status);
		activeFilters = next;
	}

	function showFilters(statuses: FileStatus[]) {
		activeFilters = new Set([...activeFilters, ...statuses]);
	}

	function toggleSelection(paths: string[], checked: boolean) {
		const next = new Set(selected);

		for (const p of paths) {
			if (checked) next.add(p);
			else next.delete(p);
		}
		selected = next;
	}

	async function loadDiff(file: AnnotatedFile): Promise<DiffData> {
		if (file.isImage) return { kind: "image" };

		const local = file.file ? file.file.getCompiledFile()[0] ?? "" : "";
		let remote = "";

		if (file.status !== "new") {
			try {
				remote = await siteManager.getNoteContent(file.path);
			} catch (e) {
				return { kind: "error", message: String(e) };
			}
		}

		if (file.status === "published" || remote === local) {
			return { kind: "nochange" };
		}

		return { kind: "diff", changes: Diff.diffLines(remote, local) };
	}

	async function selectFile(path: string) {
		activePath = path;
		const file = annotated.find((f) => f.path === path);

		if (!file) return;

		if (diffCache.has(path)) {
			diffLoading = false;
			diffData = diffCache.get(path)!;

			return;
		}

		diffLoading = true;
		diffData = null;
		const data = await loadDiff(file);
		diffCache.set(path, data);

		// guard against the user having clicked away while loading
		if (activePath === path) diffData = data;
		diffLoading = false;
	}

	// Why the confirm says a file is going away. Paths are vault paths, so
	// one still in the vault was unpublished rather than deleted.
	function removalReason(path: string): string {
		const inVault = app.vault.getAbstractFileByPath(path) !== null;
		const isImage = annotated.find((f) => f.path === path)?.isImage;

		if (!inVault) return "not in your vault";

		return isImage ? "no longer used" : "unpublished";
	}

	// Ticked notes a hidden filter keeps out of this publish, per status.
	$: heldOut = Object.fromEntries(
		(["changed", "new", "deleted"] as FileStatus[]).map((s) => [
			s,
			activeFilters.has(s)
				? 0
				: annotated.filter(
						(f) => f.status === s && selected.has(f.path),
				  ).length,
		]),
	) as Record<FileStatus, number>;

	// What the idle diff pane lists: this publish, grouped.
	$: planView = {
		publish: plan.notesToPublish.map((n) => ({
			path: n.getPath(),
			status:
				annotated.find((f) => f.path === n.getPath())?.status ??
				("changed" as FileStatus),
		})),
		remove: summary.removePaths,
		site: siteReady.map((c) => c.label),
	};

	$: progress = publishing
		? {
				known: progressKnown,
				done: progressDone,
				total: progressTotal,
				current: progressCurrent,
		  }
		: null;

	$: resultText = lastResult
		? `${resultSentence(lastResult)} ${
				isForestry
					? "Follow it in Publishes, above."
					: "Your site updates when your host finishes rebuilding it."
		  }`
		: null;

	function closeDiff() {
		activePath = null;
		diffData = null;
		diffLoading = false;
	}

	function setMode(mode: "split" | "unified") {
		diffMode = mode;
	}
</script>

<div class="dg-pc-root" bind:this={rootEl}>
	{#if loadError}
		<div class="dg-pc-state" role="alert">
			<div class="dg-pc-state-icon dg-pc-state-icon-error">
				<Icon name="cloud-off" />
			</div>
			<h2 class="dg-pc-state-title">{loadError.title}</h2>
			<p class="dg-pc-state-body">{loadError.body}</p>
			<div class="dg-pc-state-actions">
				<button class="mod-cta" on:click={reload}>Try again</button>
				{#if loadError.cause !== "network"}
					<button on:click={onOpenSettings}>Open settings</button>
				{/if}
			</div>
			<details class="dg-pc-state-details">
				<summary>Technical details</summary>
				<pre>{loadError.detail}</pre>
				<button on:click={copyLoadErrorDetails}>Copy details</button>
			</details>
		</div>
	{:else if !status}
		<div class="dg-pc-state" role="status">
			<div class="dg-pc-state-icon dg-rotate">
				<Icon name="loader" />
			</div>
			<p class="dg-pc-state-body">Checking what's ready to publish…</p>
		</div>
	{:else}
		<div class="dg-pc-top">
			<!-- First-run help is about notes; the Site tab stays clear. -->
			{#if activeTab === "notes"}
				<Tutorial bind:visible={tutorialVisible} />
			{/if}

			{#if activeTab === "notes" && showHomePageBanner && !tutorialVisible}
				<div class="dg-pc-callout dg-pc-home-banner">
					<div class="dg-pc-callout-header">
						<div class="dg-pc-callout-title">
							<Icon name="house" />
							No home page yet
						</div>
						<button on:click={onChooseHomePage}>
							Choose home page
						</button>
					</div>
					<div>
						Visitors see a plain list of notes at your site root
						until you pick a note as the home page.
					</div>
				</div>
			{/if}

			{#if missingBranch}
				<div class="dg-pc-callout dg-pc-branch-banner" role="alert">
					<div class="dg-pc-callout-header">
						<div class="dg-pc-callout-title">
							Publish branch "{missingBranch.branch}" not found
						</div>
						<button on:click={refresh} disabled={refreshing}>
							Refresh
						</button>
					</div>
					<div>
						Showing what is on the default branch, "{missingBranch.defaultBranch}",
						instead. Publishing is off until the branch exists:
						create it on GitHub, or change the publish branch in the
						plugin settings, then refresh.
					</div>
				</div>
			{/if}

			{#if limitError}
				<div class="dg-pc-callout dg-pc-limit" role="alert">
					<div class="dg-pc-callout-header">
						<div class="dg-pc-callout-title">
							{limitError.errorType === "build_limit_reached"
								? "You've used this month's publishes"
								: "Your garden is out of storage"}
						</div>
						<button
							class="clickable-icon"
							aria-label="Dismiss"
							on:click={() => (limitError = null)}
						>
							<Icon name="x" />
						</button>
					</div>
					<div>
						{#if limitError.errorType === "build_limit_reached"}
							Nothing was published. You've used {limitError.buildsUsed ??
								0} of {limitError.monthlyLimit ?? 0} publishes this
							month. They reset next month, or you can upgrade to Pro
							for 1000 a month.
						{:else}
							Nothing was published. Remove some images or notes,
							or upgrade for more storage.
						{/if}
						<a href="https://dashboard.forestry.md/settings">
							Open Forestry.md settings
						</a>
					</div>
				</div>
			{/if}

			<Notices
				{problematicFiles}
				{isForestry}
				quiet={activeTab !== "notes" ||
					tutorialVisible ||
					showHomePageBanner}
				hasChangedNotes={counts.changed > 0}
				isNewGarden={counts.published +
					counts.changed +
					counts.deleted ===
					0}
			/>

			{#if publishError}
				<div class="dg-pc-publish-error" role="alert">
					<div class="dg-pc-publish-error-header">
						<strong class="dg-pc-publish-error-title">
							<Icon name="alert-circle" />
							Couldn't publish
						</strong>
						<div class="dg-pc-publish-error-actions">
							<button on:click={copyPublishErrorDetails}>
								Copy details
							</button>
							<button on:click={() => (publishError = null)}>
								Dismiss
							</button>
						</div>
					</div>
					<div class="dg-pc-publish-error-hint">
						{#if publishPartial}
							Part of it went through: {publishPartial}. Publish
							again to finish the rest.
						{:else}
							Nothing was lost — your notes are unchanged. Often
							publishing again just works.
						{/if}
						If it keeps failing, use "Copy details" and paste it in the
						<a href={DISCORD_URL}>Discord</a> so we can help.
					</div>
					<details class="dg-pc-publish-error-details">
						<summary>Technical details</summary>
						<pre
							class="dg-pc-publish-error-message">{publishError}</pre>
					</details>
				</div>
			{/if}
		</div>

		<div class="dg-pc-tabs" role="tablist" aria-label="What to publish">
			<button
				role="tab"
				class="dg-pc-tab"
				class:is-active={activeTab === "notes"}
				aria-selected={activeTab === "notes"}
				on:click={() => (activeTab = "notes")}
			>
				Notes
				{#if actionableCount > 0}
					<span class="dg-pc-tab-count">{actionableCount}</span><span
						class="dg-sr-only"
					>
						to review</span
					>
				{/if}
			</button>
			<button
				role="tab"
				class="dg-pc-tab"
				class:is-active={activeTab === "site"}
				aria-selected={activeTab === "site"}
				on:click={() => (activeTab = "site")}
			>
				Site
				{#if siteCount > 0}
					<span class="dg-pc-tab-count">{siteCount}</span><span
						class="dg-sr-only"
					>
						not published</span
					>
				{/if}
			</button>
		</div>

		{#if activeTab === "site"}
			<div class="dg-pc-layout" role="tabpanel">
				<SiteTab
					loading={siteLoading}
					error={siteError}
					onRetry={loadSite}
					bind:active={siteSection}
					pluginId={sitePluginId}
					formVersion={siteFormVersion}
				/>
			</div>
		{:else}
			<div
				class="dg-pc-layout"
				role="tabpanel"
				class:dg-pc-has-file={activePath !== null}
				class:dg-pc-quiet={activePath === null &&
					actionableCount === 0 &&
					siteReady.length === 0}
			>
				<!-- Locked while publishing, so the plan can't change midway. -->
				<div
					class="dg-pc-tree-pane"
					class:is-busy={publishing}
					inert={publishing}
				>
					<StatusFilters
						{counts}
						{heldOut}
						active={activeFilters}
						on:toggle={(e) => toggleFilter(e.detail.status)}
					/>
					{#if (visibleTree.children ?? []).length > 0}
						{#if visiblePaths.length > 0}
							<label class="dg-pc-select-all">
								<input
									type="checkbox"
									checked={allVisibleSelected}
									use:indeterminate={someVisibleSelected}
									on:click={() =>
										toggleSelection(
											visiblePaths,
											!allVisibleSelected,
										)}
								/>
								<span>Select all</span>
								<span class="dg-pc-select-all-count">
									{#if refreshing}Updating… ·{/if}
									{visibleSelectedCount} of {visiblePaths.length}
									selected
								</span>
							</label>
						{/if}
						<FileTree
							node={visibleTree}
							{selected}
							{activePath}
							on:select={(e) => selectFile(e.detail.path)}
							on:toggle={(e) =>
								toggleSelection(
									e.detail.paths,
									e.detail.checked,
								)}
						/>
					{:else if actionableCount === 0}
						<div class="dg-pc-empty">
							<p class="dg-pc-empty-title">
								Your garden is up to date
							</p>
							<p>Every note marked for publishing is live.</p>
							{#if counts.published > 0 && !activeFilters.has("published")}
								<button
									on:click={() => showFilters(["published"])}
								>
									Show published notes
								</button>
							{/if}
						</div>
					{:else}
						<div class="dg-pc-empty">
							<p>No notes match the filters.</p>
							<button
								on:click={() =>
									showFilters(["changed", "new", "deleted"])}
							>
								Show notes to publish
							</button>
						</div>
					{/if}
				</div>
				<div class="dg-pc-diff-pane">
					<DiffPane
						path={activePath}
						status={activeFile?.status ?? null}
						data={diffData}
						loading={diffLoading}
						mode={diffMode}
						plan={planView}
						removal={activeFile?.status === "deleted"
							? removalReason(activeFile.path)
							: null}
						on:select={(e) => selectFile(e.detail.path)}
						on:site={() => (activeTab = "site")}
						on:setMode={(e) => setMode(e.detail.mode)}
						on:open={(e) => openFile(e.detail.path)}
						on:close={closeDiff}
					/>
				</div>
			</div>
		{/if}

		{#if siteUpdateTracker}
			<RecentBuilds
				tracker={siteUpdateTracker}
				siteUrl={settings.forestrySettings.baseUrl || null}
				pageName={settings.forestrySettings.forestryPageName || null}
				findNote={findVaultNote}
				{openFile}
				chooseHomePage={onChooseHomePage}
			/>
		{/if}

		<PublishBar
			{summary}
			{hiddenSelectedCount}
			siteHeldReason={siteCount > siteReady.length
				? "Theme and Light or dark don't match yet, so neither is published."
				: null}
			{publishing}
			{progress}
			result={resultText}
			failed={publishError !== null}
			{removalReason}
			removalShare={describeRemovalShare(
				plan.notesToDelete.length,
				liveNoteCount,
			)}
			siteUrl={(isForestry
				? settings.forestrySettings.baseUrl
				: settings.gardenBaseUrl) || null}
			on:dismissResult={() => (lastResult = null)}
			on:showHidden={() =>
				showFilters(
					(Object.keys(heldOut) as FileStatus[]).filter(
						(s) => heldOut[s] > 0,
					),
				)}
			blockedReason={missingBranch
				? "Publishing is off until the publish branch exists."
				: outOfPublishes
				? outOfPublishesReason
				: null}
			notice={buildRunning
				? "Publishing now replaces the build in progress."
				: null}
			on:publish={publishSelected}
			on:refresh={refresh}
		/>
	{/if}
</div>

<style>
	.dg-pc-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		box-sizing: border-box;
		/* Obsidian mobile overlays its navbar on the view; this variable is
		   the navbar's height there and 0 on desktop. */
		padding-bottom: var(--view-bottom-spacing, 0px);
		container-type: inline-size;
		overflow-y: auto;
	}

	/* Banners, progress and results. Capped so they can never squeeze the
	   tree and diff out of view; they scroll within their own strip. */
	.dg-pc-top {
		flex: 0 1 auto;
		max-height: 40%;
		min-height: 0;
		overflow-y: auto;
	}

	.dg-pc-tabs {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.dg-pc-tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: auto;
		padding: 6px 12px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		box-shadow: none;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		cursor: pointer;
	}

	@media (hover: hover) {
		.dg-pc-tab:hover {
			color: var(--text-normal);
		}
	}

	/* A centred 44px tap area without taller tabs. */
	:global(.is-mobile) .dg-pc-tab {
		position: relative;
	}

	:global(.is-mobile) .dg-pc-tab::after {
		content: "";
		position: absolute;
		inset-inline: 0;
		top: 50%;
		height: 44px;
		transform: translateY(-50%);
	}

	.dg-pc-tab.is-active {
		color: var(--text-normal);
		font-weight: var(--font-semibold);
		border-bottom-color: var(--interactive-accent);
	}

	.dg-pc-tab-count {
		min-width: 1.4em;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--background-modifier-border);
		color: var(--text-normal);
		font-size: var(--font-ui-smaller);
		font-weight: normal;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.dg-pc-layout {
		display: flex;
		flex: 1 1 auto;
		min-height: 10rem;
		overflow: hidden;
	}

	.dg-pc-tree-pane {
		flex: 0 0 33%;
		max-width: 33%;
		/* Room for the four chips on one line. */
		min-width: min(26rem, 50%);
		overflow: auto;
		border-right: 1px solid var(--background-modifier-border);
		padding: 8px;
	}

	.dg-pc-tree-pane.is-busy {
		opacity: 0.6;
	}

	/* Nothing to publish: the up-to-date message takes the whole width. */
	.dg-pc-quiet .dg-pc-tree-pane {
		flex: 1 1 auto;
		max-width: none;
		border-right: none;
	}

	.dg-pc-quiet .dg-pc-diff-pane {
		display: none;
	}

	.dg-pc-diff-pane {
		flex: 1;
		overflow: auto;
		/* No padding here: the sticky diff header can't cover a scroll
		   container's padding, which left a strip of content visible above
		   it. The header and body carry the padding instead. */
		padding: 0;
	}

	.dg-pc-select-all {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 2px 6px;
		margin-bottom: 4px;
		border-bottom: 1px solid var(--background-modifier-border);
		font-size: var(--font-ui-small);
		cursor: pointer;
		user-select: none;
	}

	:global(.is-mobile) .dg-pc-select-all {
		min-height: 44px;
		padding-block: 0;
	}

	.dg-pc-select-all-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		font-variant-numeric: tabular-nums;
	}

	/* Full-view states: loading and load failure. */
	.dg-pc-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		max-width: 28rem;
		margin: 0 auto;
		padding: 16px;
		text-align: center;
	}

	.dg-pc-state-icon {
		display: inline-flex;
		color: var(--text-muted);
	}

	.dg-pc-state-icon :global(.svg-icon) {
		width: 28px;
		height: 28px;
	}

	.dg-pc-state-icon-error {
		color: var(--text-error);
	}

	.dg-pc-state-title {
		margin: 0;
		font-size: var(--font-ui-large);
		font-weight: var(--font-semibold);
	}

	.dg-pc-state-body {
		margin: 0;
		color: var(--text-muted);
	}

	.dg-pc-state-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-top: 8px;
	}

	.dg-pc-state-details {
		width: 100%;
		margin-top: 8px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
		text-align: left;
	}

	.dg-pc-state-details summary {
		cursor: pointer;
		text-align: center;
	}

	.dg-pc-state-details pre {
		max-height: 120px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		padding: 6px 8px;
		border-radius: var(--radius-s);
		background: var(--background-secondary);
	}

	.dg-pc-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: 8px 4px;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.dg-pc-empty p {
		margin: 0;
	}

	.dg-pc-empty-title {
		color: var(--text-normal);
		font-weight: var(--font-semibold);
	}

	.dg-pc-publish-error {
		margin-bottom: 10px;
		padding: 10px 12px;
		border: 1px solid
			color-mix(
				in srgb,
				var(--background-modifier-error) 45%,
				transparent
			);
		border-radius: var(--radius-m);
		background-color: color-mix(
			in srgb,
			var(--background-modifier-error) 8%,
			transparent
		);
	}

	.dg-pc-publish-error-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.dg-pc-publish-error-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.dg-pc-publish-error-title :global(.svg-icon) {
		color: var(--text-error);
	}

	.dg-pc-publish-error-actions {
		display: flex;
		gap: 6px;
	}

	.dg-pc-publish-error-details {
		margin-top: 6px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-pc-publish-error-details summary {
		cursor: pointer;
	}

	.dg-pc-publish-error-message {
		margin: 6px 0 0;
		padding: 6px 8px;
		max-height: 120px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: var(--font-ui-smaller);
		background-color: var(--background-primary);
		border-radius: var(--radius-s);
	}

	.dg-pc-publish-error-hint {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	/* The accent link falls under 4.5:1 on the error tint. */
	.dg-pc-publish-error-hint a {
		color: var(--text-normal);
		text-decoration: underline;
	}

	/* Narrow views (phones, slim side panes): stack the tree above the diff
	   instead of squeezing both side by side. */
	@container (max-width: 640px) {
		.dg-pc-layout {
			flex-direction: column;
		}

		.dg-pc-tree-pane {
			flex: 1 1 auto;
			max-width: none;
			border-right: none;
			border-bottom: 1px solid var(--background-modifier-border);
		}

		/* No note open: the tree gets the whole pane; the publish bar
		   already says the plan. */
		.dg-pc-layout:not(.dg-pc-has-file) .dg-pc-diff-pane {
			display: none;
		}

		.dg-pc-layout.dg-pc-has-file .dg-pc-tree-pane {
			flex: 0 1 auto;
			max-height: 45%;
		}

		.dg-pc-layout.dg-pc-has-file .dg-pc-diff-pane {
			flex: 1 1 0;
		}
	}
</style>
