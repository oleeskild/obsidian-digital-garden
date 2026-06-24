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
	import StatusFilters from "./StatusFilters.svelte";
	import FileTree from "./FileTree.svelte";

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

	$: tree = buildFileTree(annotated);
	$: visibleTree = filterTree(tree, activeFilters) ?? {
		name: "",
		path: "",
		isFolder: true,
		children: [],
	};

	async function refresh() {
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

	function selectFile(path: string) {
		activePath = path;
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
				<!-- DiffPane added in Task 6 -->
				<div class="dg-pc-empty">Select a file to see changes.</div>
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
