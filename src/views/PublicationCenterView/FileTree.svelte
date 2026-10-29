<!-- src/views/PublicationCenterView/FileTree.svelte -->
<script lang="ts">
	import type { FileTreeNode } from "./fileTree";
	import Node from "./FileTreeNode.svelte";

	export let node: FileTreeNode;
	export let selected: Set<string>;
	export let activePath: string | null;

	let treeEl: HTMLElement;
	let lastFocused: string | null = null;

	const containsPath = (n: FileTreeNode, path: string): boolean =>
		n.path === path ||
		(n.children ?? []).some((c) => containsPath(c, path));

	// Roving tabindex: Tab lands on the last focused row, else the open
	// file, else the first row.
	$: focusPath =
		[lastFocused, activePath].find(
			(p): p is string => p !== null && containsPath(node, p),
		) ??
		node.children?.[0]?.path ??
		null;

	const rows = () =>
		Array.from(treeEl.querySelectorAll<HTMLElement>('[role="treeitem"]'));

	// Moves between visible rows. Collapsed folders don't render their
	// children, so DOM order is the visible order.
	function onKeydown(e: KeyboardEvent) {
		const current = (e.target as HTMLElement).closest<HTMLElement>(
			'[role="treeitem"]',
		);

		if (!current) return;

		const all = rows();
		const index = all.indexOf(current);
		let next: HTMLElement | null | undefined = null;

		switch (e.key) {
			case "ArrowDown":
				next = all[index + 1];
				break;
			case "ArrowUp":
				next = all[index - 1];
				break;
			case "Home":
				next = all[0];
				break;
			case "End":
				next = all[all.length - 1];
				break;
			case "ArrowRight":
				// An open folder: step into its first child.
				if (current.getAttribute("aria-expanded") === "true") {
					next = all[index + 1];
				}
				break;
			case "ArrowLeft":
				next =
					current.parentElement?.closest<HTMLElement>(
						'[role="treeitem"]',
					);
				break;
			default:
				return;
		}

		e.preventDefault();
		next?.focus();
	}
</script>

<div
	class="dg-pc-tree"
	role="tree"
	aria-label="Notes"
	aria-multiselectable="true"
	tabindex="-1"
	bind:this={treeEl}
	on:keydown={onKeydown}
>
	{#each node.children ?? [] as child (child.path)}
		<Node
			node={child}
			{selected}
			{activePath}
			{focusPath}
			on:select
			on:toggle
			on:focusrow={(e) => (lastFocused = e.detail.path)}
		/>
	{/each}
</div>

<style>
	.dg-pc-tree:focus {
		outline: none;
	}
</style>
