<!-- src/views/PublicationCenterView/FileTree.svelte -->
<script lang="ts">
	import type { FileTreeNode } from "./fileTree";
	import Node from "./FileTreeNode.svelte";

	export let node: FileTreeNode;
	export let selected: Set<string>;
	export let activePath: string | null;
</script>

<div class="dg-pc-tree">
	{#if (node.children ?? []).length === 0}
		<div class="dg-pc-tree-empty">No files match the current filters.</div>
	{:else}
		{#each node.children ?? [] as child (child.path)}
			<Node node={child} {selected} {activePath} on:select on:toggle />
		{/each}
	{/if}
</div>

<style>
	.dg-pc-tree-empty {
		color: var(--text-muted);
		padding: 8px;
		font-size: 0.9rem;
	}
</style>
