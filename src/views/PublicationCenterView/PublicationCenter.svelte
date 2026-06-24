<script lang="ts">
	import { onMount } from "svelte";
	import { type App, getIcon } from "obsidian";
	import DigitalGardenSettings from "../../models/settings";
	import Publisher from "../../publisher/Publisher";
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
	} from "./annotate";
	import { buildFileTree, filterTree, FileTreeNode } from "./fileTree";
	import * as Diff from "diff";
	import StatusFilters from "./StatusFilters.svelte";
	import FileTree from "./FileTree.svelte";
	import DiffPane from "./DiffPane.svelte";

	export let app: App;
	export let settings: DigitalGardenSettings;
	export let siteManager: DigitalGardenSiteManager;
	export let publisher: Publisher;
	export let statusManager: IPublishStatusManager;
	export let openFile: (path: string) => void;

	let status: PublishStatus | null = null;
	let error: string | null = null;
	let annotated: AnnotatedFile[] = [];
	let selected = new Set<string>();
	let activeFilters = new Set<FileStatus>([
		"changed",
		"new",
		"deleted",
		"published",
	]);
	let activePath: string | null = null;

	type DiffData =
		| { kind: "diff"; changes: Diff.Change[] }
		| { kind: "nochange" }
		| { kind: "image" }
		| { kind: "error"; message: string };

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
		} catch (e) {
			error = String(e);
		}
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
		<!-- PublishBar added in Task 7 -->
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

	.dg-pc-empty {
		color: var(--text-muted);
		padding: 16px;
	}

	.dg-pc-error {
		color: var(--text-error);
		padding: 16px;
	}
</style>
