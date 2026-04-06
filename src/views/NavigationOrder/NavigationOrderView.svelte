<script lang="ts">
	import { onMount } from "svelte";
	import { Notice } from "obsidian";
	import { Base64 } from "js-base64";
	import type { RepositoryConnection } from "../../repositoryConnection/RepositoryConnection";
	import type Publisher from "../../publisher/Publisher";
	import type DigitalGardenSettings from "../../models/settings";
	import { getGardenPathForNote, getRewriteRules } from "../../utils/utils";
	import SortableTree from "./SortableTree.svelte";

	export let repositoryConnection: RepositoryConnection;
	export let publisher: Publisher;
	export let settings: DigitalGardenSettings;
	export let saveSettings: () => Promise<void>;
	export let close: () => void;

	type NavigationOrder = Record<string, string[]>;

	interface TreeItem {
		name: string;
		isFolder: boolean;
		children: TreeItem[];
	}

	let loading = true;
	let saving = false;
	let error: string | null = null;
	let tree: TreeItem[] = [];
	let remoteSha: string | null = null;

	const NAV_ORDER_PATH = "src/site/_data/navigationOrder.json";

	onMount(async () => {
		await loadTree();
	});

	async function fetchRemoteOrdering(): Promise<{
		order: NavigationOrder;
		sha: string | null;
	}> {
		try {
			const file = await repositoryConnection.getFile(NAV_ORDER_PATH);

			if (file && file.content) {
				const content = Base64.decode(file.content);

				return { order: JSON.parse(content), sha: file.sha };
			}
		} catch {
			// File doesn't exist yet — that's fine
		}

		return { order: {}, sha: null };
	}

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
			const [{ order, sha }, publishedTree] = await Promise.all([
				fetchRemoteOrdering(),
				buildPublishedTree(),
			]);

			remoteSha = sha;
			tree = applyOrdering(publishedTree, order, "/");

			// Sync local settings with what's on GitHub
			settings.navigationOrder =
				Object.keys(order).length > 0 ? order : undefined;
			await saveSettings();
		} catch (e) {
			error = `Failed to load navigation data: ${e.message}`;
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

	async function handleSave() {
		saving = true;

		try {
			const ordering = extractOrdering(tree, "/");
			const content = JSON.stringify(ordering, null, 2);
			const encoded = Base64.encode(content);

			await repositoryConnection.updateFile({
				path: NAV_ORDER_PATH,
				content: encoded,
				message: "Update navigation ordering",
				sha: remoteSha ?? undefined,
			});

			settings.navigationOrder = ordering;
			await saveSettings();

			new Notice("Navigation ordering saved!");
			close();
		} catch (e) {
			error = `Failed to save: ${e.message}`;
		} finally {
			saving = false;
		}
	}

	async function handleReset() {
		if (!remoteSha) {
			new Notice("No custom ordering to reset.");

			return;
		}

		saving = true;

		try {
			await repositoryConnection.deleteFile(NAV_ORDER_PATH, {
				sha: remoteSha,
			});

			settings.navigationOrder = undefined;
			await saveSettings();

			new Notice("Navigation ordering reset to default.");
			close();
		} catch (e) {
			error = `Failed to reset: ${e.message}`;
		} finally {
			saving = false;
		}
	}
</script>

<div class="navigation-order-container">
	{#if loading}
		<div class="loading-container">
			<div class="loading-text">Loading navigation...</div>
		</div>
	{:else if error}
		<div class="error-container">
			<p class="error-text">{error}</p>
			<button on:click={loadTree}>Retry</button>
		</div>
	{:else}
		<p class="description">
			Drag and drop to reorder the navigation items on your site.
		</p>

		<div class="tree-container">
			<SortableTree bind:items={tree} />
		</div>

		<div class="button-container">
			<button
				on:click={handleReset}
				disabled={saving}
				class="reset-button"
			>
				Reset to default
			</button>
			<div class="right-buttons">
				<button on:click={close} disabled={saving}>Cancel</button>
				<button on:click={handleSave} disabled={saving} class="mod-cta">
					{saving ? "Saving..." : "Save"}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.navigation-order-container {
		display: flex;
		flex-direction: column;
		min-height: 300px;
		max-height: 60vh;
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

	.description {
		margin-bottom: 0.5rem;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.tree-container {
		flex: 1;
		overflow-y: auto;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		padding: 0.5rem;
		margin-bottom: 1rem;
	}

	.button-container {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.right-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.reset-button {
		color: var(--text-error);
	}

	:global(.dg-navigation-order-modal) {
		width: 500px;
		max-width: 90vw;
	}

	:global(.dg-navigation-order-modal .modal-content) {
		max-height: 70vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
