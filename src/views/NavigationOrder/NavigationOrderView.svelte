<script lang="ts">
	import { onMount } from "svelte";
	import type Publisher from "../../publisher/Publisher";
	import type DigitalGardenSettings from "../../models/settings";
	import { getGardenPathForNote, getRewriteRules } from "../../utils/utils";
	import SortableTree from "./SortableTree.svelte";

	export let publisher: Publisher;
	export let settings: DigitalGardenSettings;
	/**
	 * Called with the new order after each change (undefined = the default
	 * order). Saving it locally is the caller's job; it is published with
	 * the site settings.
	 */
	export let onChange: (
		order: NavigationOrder | undefined,
	) => void | Promise<void>;

	type NavigationOrder = Record<string, string[]>;

	interface TreeItem {
		name: string;
		isFolder: boolean;
		children: TreeItem[];
	}

	let loading = true;
	let error: string | null = null;
	let tree: TreeItem[] = [];
	// The order as loaded, and the setting it came from: dragging back to
	// it restores that setting instead of leaving an equivalent edit.
	let loadedOrdering = "";
	let loadedOrder: NavigationOrder | undefined;
	let lastEmitted = "";
	// Whether a custom order is set, so "Use default order" has something to do.
	let custom = false;

	$: if (!loading) treeChanged(tree);

	function treeChanged(items: TreeItem[]) {
		const current = JSON.stringify(extractOrdering(items, "/"));

		if (current === lastEmitted) return;
		lastEmitted = current;

		const order =
			current === loadedOrdering
				? loadedOrder
				: extractOrdering(items, "/");
		custom = order !== undefined;
		onChange(order);
	}

	onMount(async () => {
		await loadTree();
	});

	async function buildPublishedTree(): Promise<TreeItem[]> {
		const { notes } = await publisher.getFilesMarkedForPublishing();
		const rewriteRules = getRewriteRules(settings.pathRewriteRules);

		// Build folder structure from garden paths (respecting rewrite rules and dg-path)
		type FolderNode = { __isFile?: boolean } & Record<string, FolderNode>;
		const root: FolderNode = {};

		for (const note of notes) {
			const vaultPath = note.getPath();

			// Check for dg-path frontmatter override, then apply rewrite rules
			const frontmatter = note.getFrontmatter();

			const gardenPath = frontmatter?.["dg-path"]
				? frontmatter["dg-path"]
				: getGardenPathForNote(vaultPath, rewriteRules);

			const parts = gardenPath.split("/");
			// Strip file extension from the filename to get the stem
			const lastIdx = parts.length - 1;
			const dotIdx = parts[lastIdx].lastIndexOf(".");

			if (dotIdx > 0) {
				parts[lastIdx] = parts[lastIdx].substring(0, dotIdx);
			}
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];

				if (!current[part]) {
					current[part] =
						i === parts.length - 1 ? { __isFile: true } : {};
				}

				if (i < parts.length - 1) {
					current = current[part];
				}
			}
		}

		return convertToTreeItems(root);
	}

	function convertToTreeItems(
		obj: Record<string, { __isFile?: boolean } & Record<string, unknown>>,
	): TreeItem[] {
		const items: TreeItem[] = [];

		for (const [name, value] of Object.entries(obj)) {
			if (value.__isFile) {
				items.push({ name, isFolder: false, children: [] });
			} else {
				const children = convertToTreeItems(value);
				items.push({ name, isFolder: true, children });
			}
		}

		// Default sort: folders first, then alphabetical
		items.sort((a, b) => {
			if (a.isFolder && !b.isFolder) return -1;

			if (!a.isFolder && b.isFolder) return 1;

			return a.name.localeCompare(b.name);
		});

		return items;
	}

	function applyOrdering(
		items: TreeItem[],
		ordering: NavigationOrder,
		path: string,
	): TreeItem[] {
		const orderList = ordering[path];

		let result: TreeItem[];

		if (orderList && Array.isArray(orderList)) {
			const itemMap = new Map(items.map((item) => [item.name, item]));
			const ordered: TreeItem[] = [];
			const seen = new Set<string>();

			for (const name of orderList) {
				const item = itemMap.get(name);

				if (item) {
					ordered.push(item);
					seen.add(name);
				}
			}

			// Append items not in the ordering
			for (const item of items) {
				if (!seen.has(item.name)) {
					ordered.push(item);
				}
			}

			result = ordered;
		} else {
			result = items;
		}

		// Recursively apply to children
		for (const item of result) {
			if (item.isFolder && item.children.length > 0) {
				const childPath =
					path === "/" ? `/${item.name}` : `${path}/${item.name}`;

				item.children = applyOrdering(
					item.children,
					ordering,
					childPath,
				);
			}
		}

		return result;
	}

	async function loadTree() {
		loading = true;
		error = null;

		try {
			const publishedTree = await buildPublishedTree();
			loadedOrder = settings.navigationOrder;
			tree = applyOrdering(publishedTree, loadedOrder ?? {}, "/");
			loadedOrdering = JSON.stringify(extractOrdering(tree, "/"));
			lastEmitted = loadedOrdering;
			custom = loadedOrder !== undefined;
		} catch (e) {
			error = `Couldn't read your published notes: ${e.message}`;
		} finally {
			loading = false;
		}
	}

	function extractOrdering(items: TreeItem[], path: string): NavigationOrder {
		let ordering: NavigationOrder = {};
		ordering[path] = items.map((item) => item.name);

		for (const item of items) {
			if (item.isFolder && item.children.length > 0) {
				const childPath =
					path === "/" ? `/${item.name}` : `${path}/${item.name}`;
				const childOrdering = extractOrdering(item.children, childPath);
				ordering = { ...ordering, ...childOrdering };
			}
		}

		return ordering;
	}

	async function resetToDefault() {
		await onChange(undefined);
		await loadTree();
	}
</script>

<div class="navigation-order-container">
	{#if loading}
		<div class="loading-container" role="status">
			<div class="loading-text">Reading your published notes…</div>
		</div>
	{:else if error}
		<div class="error-container" role="alert">
			<p class="error-text">{error}</p>
			<button on:click={loadTree}>Try again</button>
		</div>
	{:else}
		<div class="tree-container">
			<SortableTree bind:items={tree} />
		</div>

		<div class="button-container">
			<button on:click={resetToDefault} disabled={!custom}>
				Use default order
			</button>
		</div>
	{/if}
</div>

<style>
	.navigation-order-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		/* Setting-row controls align right; a tree reads from the left. */
		text-align: start;
	}

	.loading-container {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.error-container {
		padding: 1rem;
	}

	.error-text {
		color: var(--text-error);
	}

	/* It sits inside a setting row already; no second box. */
	.tree-container {
		flex: 1;
		margin: 4px 0 12px;
	}

	.button-container {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
</style>
