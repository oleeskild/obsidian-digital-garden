<script lang="ts">
	import { onMount } from "svelte";
	import { getIcon, Notice } from "obsidian";
	import Publisher from "../../publisher/Publisher";
	import { LimitReachedError } from "../../forestry/LimitReachedError";
	import { notifyLimitReached } from "../../forestry/limitNotice";
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
	import { buildFileTree, filterTree } from "./fileTree";
	import * as Diff from "diff";
	import StatusFilters from "./StatusFilters.svelte";
	import FileTree from "./FileTree.svelte";
	import DiffPane from "./DiffPane.svelte";
	import Notices from "./Notices.svelte";
	import PublishBar from "./PublishBar.svelte";
	import RecentBuilds from "./RecentBuilds.svelte";
	import Tutorial from "./Tutorial.svelte";
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
	let showHomePageBanner = false;
	export let registerApi: (api: {
		maybeRefresh: () => void;
	}) => void = () => {};

	let status: PublishStatus | null = null;
	let error: string | null = null;
	let refreshing = false;
	let lastRefreshAt = 0;
	const REFRESH_DEBOUNCE_MS = 3000;
	let annotated: AnnotatedFile[] = [];
	let selected = new Set<string>();
	// "published" (already in sync) is hidden by default so the view focuses
	// on notes that need action; the user can toggle it on via the chip.
	let activeFilters = new Set<FileStatus>(["changed", "new", "deleted"]);
	let activePath: string | null = null;

	type DiffData =
		| { kind: "diff"; changes: Diff.Change[] }
		| { kind: "nochange" }
		| { kind: "image" }
		| { kind: "error"; message: string };

	let problematicFiles: { path: string; issue: string }[] = [];
	let publishing = false;
	let publishError: string | null = null;
	let progressTotal = 0;
	let progressDone = 0;
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

	$: selectedCount = selected.size;

	let diffMode: "split" | "unified" = "split";
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

	async function loadStatus({ background = false } = {}) {
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
			error = null;
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
			lastRefreshAt = Date.now();

			// Drop the open diff if its file no longer exists.
			if (activePath && !annotated.some((f) => f.path === activePath)) {
				activePath = null;
				diffData = null;
			}
		} catch (e) {
			if (background) {
				// eslint-disable-next-line no-undef
				console.error(
					"Publication Center: background refresh failed",
					e,
				);
			} else {
				error = String(e);
			}
		} finally {
			refreshing = false;
		}
	}

	// Full refresh with the loading spinner; resets selection to the default.
	// Used on first open and by the manual Refresh button.
	function refresh() {
		return loadStatus({ background: false });
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
				issue: "Multiple files marked as home (dg-home: true). Only one should be.",
			}));
		}
	}

	async function publishSelected() {
		const plan = buildPublishPlan(selected, annotated);

		const deletesTotal =
			plan.notesToDelete.length + plan.imagesToDelete.length;

		// Provisional total; the batch publish reports its real step count
		// (blob uploads incl. images + the commit) via onProgress below.
		progressTotal = plan.notesToPublish.length + deletesTotal;

		if (progressTotal === 0) return;

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
		progressDone = 0;

		try {
			progressCurrent = "Preparing upload…";

			let batchSteps = plan.notesToPublish.length;

			const batchResult = await publisher.publishBatch(
				plan.notesToPublish,
				(done, total, message) => {
					batchSteps = total;
					progressTotal = total + deletesTotal;
					progressDone = done;
					progressCurrent = message;
				},
			);
			progressDone = batchSteps;

			if (batchResult.success) {
				for (const note of plan.notesToPublish) {
					publishedPaths.add(note.getPath());
				}
			} else if (plan.notesToPublish.length > 0) {
				hadFailure = true;
				publishError = batchResult.error ?? "Unknown error";
			}

			if (deletesTotal > 0) {
				const deleteResult = await publisher.deleteBatch(
					plan.notesToDelete,
					plan.imagesToDelete,
					(done, total, message) => {
						progressTotal = batchSteps + total;
						progressDone = batchSteps + done;
						progressCurrent = message;
					},
				);

				if (deleteResult.success) {
					for (const path of plan.notesToDelete) {
						removedPaths.add(path);
					}

					for (const path of plan.imagesToDelete) {
						removedPaths.add(path);
					}
				} else {
					hadFailure = true;

					publishError = [publishError, deleteResult.error]
						.filter(Boolean)
						.join("\n");
				}
			}

			new Notice(
				hadFailure
					? "Publishing failed. See the details in the Publication Center."
					: "Publication complete.",
			);
		} catch (e) {
			if (e instanceof LimitReachedError) {
				notifyLimitReached(e);
			} else {
				Logger.error("Publication Center: publish failed", e);
				publishError = describeError(e);

				new Notice(
					"Publishing failed. See the details in the Publication Center.",
				);
			}
		} finally {
			// Reflect everything that succeeded, even if a later step threw.
			applyOptimisticUpdate(publishedPaths, removedPaths);
			publishing = false;

			// Anything that reached the repo will trigger a site update;
			// start tracking it (strip + status bar).
			if (publishedPaths.size > 0 || removedPaths.size > 0) {
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
		refresh();
		registerApi({ maybeRefresh });
	});

	$: counts = {
		changed: annotated.filter((f) => f.status === "changed").length,
		new: annotated.filter((f) => f.status === "new").length,
		deleted: annotated.filter((f) => f.status === "deleted").length,
		published: annotated.filter((f) => f.status === "published").length,
	} as Record<FileStatus, number>;

	function toggleFilter(status: FileStatus) {
		const next = new Set(activeFilters);

		if (next.has(status)) next.delete(status);
		else next.add(status);
		activeFilters = next;
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

	function setMode(mode: "split" | "unified") {
		diffMode = mode;
	}

	const bigRotatingCog = () => {
		const cog = getIcon("cog");
		cog?.classList.add("dg-rotate");
		cog?.style.setProperty("width", "40px");
		cog?.style.setProperty("height", "40px");

		return cog;
	};
</script>

<div class="dg-pc-root">
	{#if error}
		<div class="dg-pc-error">
			Could not load publication status: {error}
		</div>
	{:else if !status}
		<div class="dg-pc-loading">
			{@html bigRotatingCog()?.outerHTML ?? ""}
			<div>Calculating publication status…</div>
		</div>
	{:else}
		<Tutorial />

		{#if showHomePageBanner}
			<div class="dg-pc-callout dg-pc-home-banner">
				<div class="dg-pc-callout-header">
					<div class="dg-pc-callout-title">🏡 No home page yet</div>
					<button class="mod-cta" on:click={onChooseHomePage}>
						Choose home page
					</button>
				</div>
				<div>
					Visitors see a plain list of notes at your site root until
					you pick a note as the home page.
				</div>
			</div>
		{/if}

		<Notices {problematicFiles} />

		{#if refreshing}
			<div class="dg-pc-syncing">Updating…</div>
		{/if}

		{#if publishing}
			<div class="dg-pc-progress">
				<div>
					{progressDone} of {progressTotal} processed
				</div>
				<div class="dg-pc-progress-track">
					<div
						class="dg-pc-progress-fill"
						style="width: {progressTotal
							? (progressDone / progressTotal) * 100
							: 0}%"
					></div>
				</div>
				<div class="dg-pc-progress-current">{progressCurrent}</div>
			</div>
		{/if}

		{#if publishError}
			<div class="dg-pc-publish-error">
				<div class="dg-pc-publish-error-header">
					<strong>Publishing failed</strong>
					<div class="dg-pc-publish-error-actions">
						<button on:click={copyPublishErrorDetails}>
							Copy details
						</button>
						<button on:click={() => (publishError = null)}>
							Dismiss
						</button>
					</div>
				</div>
				<pre class="dg-pc-publish-error-message">{publishError}</pre>
				<div class="dg-pc-publish-error-hint">
					Nothing was lost — your notes are unchanged. Often
					publishing again just works. If it keeps failing, click
					"Copy details" and paste it in the Discord so we can help.
				</div>
			</div>
		{/if}

		<div class="dg-pc-layout">
			<div class="dg-pc-tree-pane">
				<StatusFilters
					{counts}
					active={activeFilters}
					on:toggle={(e) => toggleFilter(e.detail.status)}
				/>
				<FileTree
					node={visibleTree}
					{selected}
					{activePath}
					on:select={(e) => selectFile(e.detail.path)}
					on:toggle={(e) =>
						toggleSelection(e.detail.paths, e.detail.checked)}
				/>
			</div>
			<div class="dg-pc-diff-pane">
				<DiffPane
					path={activePath}
					status={activeFile?.status ?? null}
					data={diffData}
					loading={diffLoading}
					mode={diffMode}
					on:setMode={(e) => setMode(e.detail.mode)}
					on:open={(e) => openFile(e.detail.path)}
				/>
			</div>
		</div>

		{#if siteUpdateTracker}
			<RecentBuilds tracker={siteUpdateTracker} />
		{/if}

		<PublishBar
			{selectedCount}
			{publishing}
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
	}

	.dg-pc-layout {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.dg-pc-tree-pane {
		flex: 0 0 33%;
		max-width: 33%;
		overflow: auto;
		border-right: 1px solid var(--background-modifier-border);
		padding: 8px;
	}

	.dg-pc-diff-pane {
		flex: 1;
		overflow: auto;
		padding: 8px;
	}

	.dg-pc-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		font-size: 1.2rem;
		gap: 8px;
	}

	.dg-pc-error {
		color: var(--text-error);
		padding: 16px;
	}

	.dg-pc-publish-error {
		margin: 8px 16px;
		padding: 10px 12px;
		border: 1px solid var(--background-modifier-error);
		border-radius: 6px;
		background-color: var(--background-modifier-error-hover, transparent);
	}

	.dg-pc-publish-error-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--text-error);
	}

	.dg-pc-publish-error-actions {
		display: flex;
		gap: 6px;
	}

	.dg-pc-publish-error-message {
		margin: 8px 0;
		padding: 6px 8px;
		max-height: 120px;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: var(--font-ui-smaller);
		background-color: var(--background-primary);
		border-radius: 4px;
	}

	.dg-pc-publish-error-hint {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-pc-syncing {
		color: var(--text-muted);
		font-size: 0.8rem;
		padding: 2px 4px 6px;
	}

	.dg-pc-progress {
		padding: 8px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.dg-pc-progress-track {
		height: 4px;
		background: var(--background-modifier-border);
		border-radius: 2px;
		margin: 6px 0;
	}

	.dg-pc-progress-fill {
		height: 100%;
		background: var(--interactive-accent);
		transition: width 0.3s ease;
	}

	.dg-pc-progress-current {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
</style>
