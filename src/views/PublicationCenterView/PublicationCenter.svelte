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

	export let app: App;
	export let settings: DigitalGardenSettings;
	export let siteManager: DigitalGardenSiteManager;
	export let publisher: Publisher;
	export let statusManager: IPublishStatusManager;
	export let openFile: (path: string) => void;

	let status: PublishStatus | null = null;
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
		status = null;
		const s = await statusManager.getPublishStatus();
		status = s;
		annotated = annotateFiles(s);
		selected = defaultSelection(annotated);
	}

	onMount(refresh);

	const bigRotatingCog = () => {
		const cog = getIcon("cog");
		cog?.classList.add("dg-rotate");
		cog?.style.setProperty("width", "40px");
		cog?.style.setProperty("height", "40px");

		return cog;
	};
</script>

<div class="dg-pc-root">
	{#if !status}
		<div class="dg-pc-loading">
			{@html bigRotatingCog()?.outerHTML ?? ""}
			<div>Calculating publication status…</div>
		</div>
	{:else}
		<div class="dg-pc-layout">
			<div class="dg-pc-tree-pane">
				<!-- StatusFilters + FileTree added in Task 5 -->
				<pre>{JSON.stringify(
						visibleTree.children?.map((c) => c.name),
						null,
						2,
					)}</pre>
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
</style>
