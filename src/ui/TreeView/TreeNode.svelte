<script lang="ts" context="module">
	// retain module scoped expansion state for each tree node
	export const _expansionState: Record<string, boolean> = {
		/* treeNodeId: expanded <boolean> */
	};
</script>

<!-- TreeView with checkbox https://svelte.dev/repl/eca6f6392e294247b4f379fde3069274?version=3.46.6 -->

<script lang="ts">
	import { createEventDispatcher } from "svelte";

	import TreeNode from "src/models/TreeNode";
	import Icon from "../Icon.svelte";
	export let tree: TreeNode;
	export let readOnly: boolean = false;
	export let enableShowDiff: boolean = false;
	const dispatch = createEventDispatcher();

	let { isRoot } = tree;

	let expanded = _expansionState[tree.path] || false;
	const toggleExpansion = () => {
		expanded = _expansionState[tree.path] = !expanded;
	};

	$: arrowDown = expanded;

	const toggleCheck = () => {
		// update the current node's state here, the UI only need to represent it,
		// don't need to bind the check state to the UI
		tree.checked = !tree.checked;

		// emit node 'toggle' event, notify parent compnent to rebuild the entire tree's state
		dispatch("toggle", {
			node: tree,
		});
	};
	const dispatchChecked = (e: { detail: { node: TreeNode } }) => {
		dispatch("toggle", { node: e.detail.node });
	};

	const setIndeterminate = (
		node: HTMLInputElement,
		params: { indeterminate: boolean },
	) => {
		node.indeterminate = params.indeterminate;
	};

	const showDiff = (e: MouseEvent) => {
		e.stopPropagation();
		dispatch("showDiff", { node: tree });
	};

	const dispatchShowDiff = (node: TreeNode) => {
		dispatch("showDiff", { node });
	};
</script>

<ul class:isRoot>
	<li>
		{#if tree.children}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<span>
				<span on:click={toggleExpansion} class="arrow" class:arrowDown>
					<Icon name="chevron-right" />
				</span>
				{#if !isRoot}
					<Icon name="folder" />
					{#if !readOnly}
						<input
							type="checkbox"
							data-label={tree.name}
							checked={tree.checked}
							use:setIndeterminate={{
								indeterminate: tree.indeterminate,
							}}
							on:click={toggleCheck}
						/>
					{/if}
					<span on:click={toggleExpansion}>{tree.name}</span>
				{:else}
					{#if !readOnly}
						<input
							type="checkbox"
							data-label={tree.name}
							checked={tree.checked}
							use:setIndeterminate={{
								indeterminate: tree.indeterminate,
							}}
							on:click={toggleCheck}
						/>
					{/if}

					<span class="root-header" on:click={toggleExpansion}
						>{tree.name}</span
					>
				{/if}
			</span>
			{#if expanded}
				{#each tree.children as child}
					<svelte:self
						on:toggle={dispatchChecked}
						on:showDiff={(e) => dispatchShowDiff(e.detail.node)}
						{enableShowDiff}
						{readOnly}
						tree={child}
					/>
				{/each}
			{/if}
		{:else if !isRoot}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<span>
				<span class="no-arrow" />
				<Icon name="file" />
				{#if !readOnly}
					<input
						type="checkbox"
						data-label={tree.name}
						checked={tree.checked}
						use:setIndeterminate={{
							indeterminate: tree.indeterminate,
						}}
						on:click={toggleCheck}
					/>
				{/if}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<span on:click={toggleExpansion}>{tree.name}</span>
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				{#if enableShowDiff}
					<span title="Show changes" class="diff" on:click={showDiff}>
						<Icon name="file-diff" />
					</span>
				{/if}
			</span>
		{/if}
	</li>
</ul>

<style>
	ul {
		margin: 0;
		list-style: none;
		padding-left: 1.2rem;
		user-select: none;
	}

	li {
		margin: 0.2rem 0;
	}

	.no-arrow {
		padding-left: calc(var(--icon-size) + 2px);
	}
	.arrow {
		cursor: pointer;
		display: inline-block;
		/* transition: transform 200ms; */
	}
	.arrowDown {
		transform: rotate(90deg);
	}
	ul.isRoot {
		padding-left: 0;
	}

	.root-header {
		font-weight: bold;
		font-size: 1.2rem;
	}
	input:indeterminate {
		background-color: var(--checkbox-color);
		border-color: var(--checkbox-color);
	}
	input[type="checkbox"]:indeterminate:after {
		content: "";
		top: -1px;
		left: -1px;
		position: absolute;
		width: var(--checkbox-size);
		height: var(--checkbox-size);
		display: block;
		background-color: var(--checkbox-marker-color);
		-webkit-mask-position: 52% 52%;
		mask-position: 52% 52%;
		-webkit-mask-size: 65%;
		mask-size: 65%;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-image: url('data:image/svg+xml; utf8,<svg fill="none" width="12px" height="12px" viewBox="0 0 32 32" id="icon" xmlns="http://www.w3.org/2000/svg"><rect fill="%23000000" x="4" y="4" width="24" height="24"/></svg>');
		mask-image: url('data:image/svg+xml; utf8,<svg fill="none" width="12px" height="12px" viewBox="0 0 32 32" id="icon" xmlns="http://www.w3.org/2000/svg"><rect fill="%23000000" x="4" y="4" width="24" height="24"/></svg>');
	}

	.diff {
		cursor: pointer;
		display: inline-block;
		margin-left: 4px;
	}
</style>
