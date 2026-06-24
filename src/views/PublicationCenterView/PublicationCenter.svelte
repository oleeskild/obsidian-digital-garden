<script lang="ts">
	import { onMount } from "svelte";
	import { getIcon, Notice } from "obsidian";
	import Publisher from "../../publisher/Publisher";
	import { LimitReachedError } from "../../forestry/LimitReachedError";
	import { notifyLimitReached } from "../../forestry/limitNotice";
	import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
	import {
		IPublishStatusManager,
		PublishStatus,
	} from "../../publisher/PublishStatusManager";
	import {
		annotateFiles,
		defaultSelection,
		AnnotatedFile,
		FileStatus,
		buildPublishPlan,
	} from "./annotate";
	import { buildFileTree, filterTree, FileTreeNode } from "./fileTree";
	import * as Diff from "diff";
	import StatusFilters from "./StatusFilters.svelte";
	import FileTree from "./FileTree.svelte";
	import DiffPane from "./DiffPane.svelte";
	import Notices from "./Notices.svelte";
	import PublishBar from "./PublishBar.svelte";
	import Tutorial from "./Tutorial.svelte";

	export let siteManager: DigitalGardenSiteManager;
	export let publisher: Publisher;
	export let statusManager: IPublishStatusManager;
	export let openFile: (path: string) => void;

	let status: PublishStatus | null = null;
	let error: string | null = null;
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
	let progressTotal = 0;
	let progressDone = 0;
	let progressCurrent = "";

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

	async function refresh() {
		diffCache = new Map();
		diffData = null;
		diffLoading = false;
		activePath = null;
		error = null;
		status = null;
		try {
			const s = await statusManager.getPublishStatus();
			status = s;
			annotated = annotateFiles(s);
			selected = defaultSelection(annotated);
			validate(s);
		} catch (e) {
			error = String(e);
		}
	}

	function validate(s: PublishStatus) {
		problematicFiles = [];

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
		progressTotal =
			plan.notesToPublish.length +
			plan.notesToDelete.length +
			plan.imagesToDelete.length;

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
		progressDone = 0;
		try {
			progressCurrent = "Publishing notes…";
			const published = await publisher.publishBatch(plan.notesToPublish);
			progressDone += plan.notesToPublish.length;

			if (published) {
				for (const note of plan.notesToPublish) {
					publishedPaths.add(note.getPath());
				}
			} else if (plan.notesToPublish.length > 0) {
				hadFailure = true;
			}

			for (const path of plan.notesToDelete) {
				progressCurrent = `Deleting ${path}`;
				await publisher.deleteNote(path);
				removedPaths.add(path);
				progressDone += 1;
			}

			for (const path of plan.imagesToDelete) {
				progressCurrent = `Deleting ${path}`;
				await publisher.deleteImage(path);
				removedPaths.add(path);
				progressDone += 1;
			}

			new Notice(
				hadFailure
					? "Some notes failed to publish. Check the console for details."
					: "Publication complete.",
			);
		} catch (e) {
			if (e instanceof LimitReachedError) {
				notifyLimitReached(e);
			} else {
				console.error("Publication Center: publish failed", e);
				new Notice("Unable to publish, something went wrong.");
			}
		} finally {
			// Reflect everything that succeeded, even if a later step threw.
			applyOptimisticUpdate(publishedPaths, removedPaths);
			publishing = false;
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

	onMount(refresh);

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

		const local = file.file ? (file.file.getCompiledFile()[0] ?? "") : "";
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
		<div class="dg-pc-error">Could not load publication status: {error}</div>
	{:else if !status}
		<div class="dg-pc-loading">
			{@html bigRotatingCog()?.outerHTML ?? ""}
			<div>Calculating publication status…</div>
		</div>
	{:else}
		<Tutorial />

		<Notices {problematicFiles} />

		{#if publishing}
			<div class="dg-pc-progress">
				<div>
					{progressDone} of {progressTotal} processed
				</div>
				<div class="dg-pc-progress-track">
					<div
						class="dg-pc-progress-fill"
						style="width: {progressTotal ? (progressDone / progressTotal) * 100 : 0}%"
					/>
				</div>
				<div class="dg-pc-progress-current">{progressCurrent}</div>
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
