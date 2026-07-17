<!-- src/views/PublicationCenterView/FileTreeNode.svelte -->
<script lang="ts" context="module">
	export const _expanded: Record<string, boolean> = {};
</script>

<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import Icon from "../../ui/Icon.svelte";
	import { FileTreeNode, collectFilePaths } from "./fileTree";

	export let node: FileTreeNode;
	export let selected: Set<string>;
	export let activePath: string | null;

	const dispatch = createEventDispatcher();

	let expanded = _expanded[node.path] ?? true;

	const toggleExpand = () => {
		expanded = _expanded[node.path] = !expanded;
	};

	$: paths = collectFilePaths(node);
	$: allChecked = paths.length > 0 && paths.every((p) => selected.has(p));
	$: someChecked = paths.some((p) => selected.has(p));
	$: indeterminate = someChecked && !allChecked;

	const setIndeterminate = (
		el: HTMLInputElement,
		params: { indeterminate: boolean },
	) => {
		el.indeterminate = params.indeterminate;

		return {
			update(p: { indeterminate: boolean }) {
				el.indeterminate = p.indeterminate;
			},
		};
	};

	const toggleCheck = () => {
		if (node.isFolder) {
			dispatch("toggle", { paths, checked: !allChecked });
		} else {
			dispatch("toggle", {
				paths: [node.path],
				checked: !selected.has(node.path),
			});
		}
	};

	const selectFile = () => {
		if (!node.isFolder) dispatch("select", { path: node.path });
	};
</script>

{#if node.isFolder}
	<div class="dg-pc-folder">
		<div class="dg-pc-row">
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<span
				class="dg-pc-arrow"
				class:open={expanded}
				on:click={toggleExpand}
			>
				<Icon name="chevron-right" />
			</span>
			<input
				type="checkbox"
				checked={allChecked}
				use:setIndeterminate={{ indeterminate }}
				on:click={toggleCheck}
			/>
			<Icon name="folder" />
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<span class="dg-pc-name" on:click={toggleExpand}>{node.name}</span>
		</div>
		{#if expanded}
			<div class="dg-pc-children">
				{#each node.children ?? [] as child (child.path)}
					<svelte:self
						node={child}
						{selected}
						{activePath}
						on:select
						on:toggle
					/>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="dg-pc-row dg-pc-file"
		class:active={activePath === node.path}
		on:click={selectFile}
	>
		<span class="dg-pc-arrow-spacer"></span>
		<input
			type="checkbox"
			checked={selected.has(node.path)}
			on:click|stopPropagation={toggleCheck}
		/>
		<span
			class="dg-pc-status-dot dg-pc-dot-{node.status}"
			title={node.status}
		></span>
		<span class="dg-pc-name">{node.name}</span>
	</div>
{/if}

<style>
	.dg-pc-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 1px 2px;
		border-radius: 4px;
		cursor: pointer;
		user-select: none;
	}

	.dg-pc-file:hover {
		background: var(--background-modifier-hover);
	}

	.dg-pc-file.active {
		background: var(
			--background-modifier-active-hover,
			var(--background-secondary-alt)
		);
	}

	.dg-pc-children {
		padding-left: 1.1rem;
	}

	.dg-pc-arrow {
		display: inline-flex;
		transition: transform 100ms;
	}

	.dg-pc-arrow.open {
		transform: rotate(90deg);
	}

	.dg-pc-arrow-spacer {
		width: var(--icon-size, 16px);
		display: inline-block;
	}

	.dg-pc-name {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dg-pc-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: 0 0 auto;
	}

	.dg-pc-dot-changed {
		background: var(--text-warning, orange);
	}

	.dg-pc-dot-new {
		background: var(--text-success, green);
	}

	.dg-pc-dot-deleted {
		background: var(--text-error, red);
	}

	.dg-pc-dot-published {
		background: var(--text-muted);
	}
</style>
