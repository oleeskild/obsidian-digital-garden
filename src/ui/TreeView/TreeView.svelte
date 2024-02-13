<script lang="ts">
	import Node from "./TreeNode.svelte";
	import TreeNode from "src/models/TreeNode";

	export let tree: TreeNode;
	export let readOnly: boolean = false;
	export let enableShowDiff: boolean = false;
	export let showDiff: (path: string) => void;

	const treeMap: Record<string, TreeNode> = {
		/* child label: parent node */
	};
	function initTreeMap(tree: TreeNode) {
		if (tree.children) {
			for (const child of tree.children) {
				treeMap[child.path] = tree;
				initTreeMap(child);
			}
		}
	}
	initTreeMap(tree);

	function rebuildChildren(node: TreeNode, checkAsParent = true) {
		if (node.children) {
			for (const child of node.children) {
				if (checkAsParent) child.checked = !!node.checked;
				rebuildChildren(child, checkAsParent);
			}

			node.indeterminate =
				node.children.some((c) => c.indeterminate) ||
				(node.children.some((c) => !!c.checked) &&
					node.children.some((c) => !c.checked));
		}
	}

	function rebuildTree(
		e: { detail: { node: TreeNode } },
		checkAsParent = true,
	) {
		const node = e.detail.node;
		let parent = treeMap[node.path];
		rebuildChildren(node, checkAsParent);

		while (parent) {
			const allCheck = parent?.children?.every((c) => !!c.checked);

			if (allCheck) {
				parent.indeterminate = false;
				parent.checked = true;
			} else {
				const haveCheckedOrIndetermine = parent?.children?.some(
					(c) => !!c.checked || c.indeterminate,
				);

				if (haveCheckedOrIndetermine) {
					parent.indeterminate = true;
				} else {
					parent.indeterminate = false;
				}
				parent.checked = false;
			}

			parent = treeMap[parent.path];
		}
		tree = tree;
	}
	// init the tree state
	rebuildTree({ detail: { node: tree } }, false);
</script>

<div>
	<Node
		{tree}
		{readOnly}
		{enableShowDiff}
		on:toggle={rebuildTree}
		on:showDiff={(e) => showDiff(e.detail.node.path)}
	/>
</div>

<style>
</style>
