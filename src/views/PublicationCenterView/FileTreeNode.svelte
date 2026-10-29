<!-- src/views/PublicationCenterView/FileTreeNode.svelte -->
<script lang="ts" context="module">
	export const _expanded: Record<string, boolean> = {};
</script>

<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import Icon from "../../ui/Icon.svelte";
	import StatusDot from "./StatusDot.svelte";
	import { indeterminate } from "./checkboxState";
	import { collectSelectablePaths } from "./fileTree";
	import type { FileTreeNode } from "./fileTree";
	import { STATUS_LABEL } from "./annotate";

	export let node: FileTreeNode;
	export let selected: Set<string>;
	export let activePath: string | null;
	/** The one row that takes Tab focus (roving tabindex). */
	export let focusPath: string | null;
	export let level = 1;

	const dispatch = createEventDispatcher();

	let expanded = _expanded[node.path] ?? true;

	const setExpanded = (value: boolean) => {
		expanded = _expanded[node.path] = value;
	};

	$: paths = collectSelectablePaths(node);
	// Published notes and all-published folders have nothing to tick.
	$: checkable = paths.length > 0;
	$: allChecked = paths.length > 0 && paths.every((p) => selected.has(p));
	$: someChecked = paths.some((p) => selected.has(p));
	$: partial = someChecked && !allChecked;
	$: fileChecked = !node.isFolder && selected.has(node.path);
	$: statusLabel = node.status ? STATUS_LABEL[node.status] : "";

	const toggleCheck = () => {
		if (!checkable) return;

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

	// Keys that act on this row only. Up/Down/Home/End and moving to the
	// parent are handled by the tree, so they bubble.
	const onKeydown = (e: KeyboardEvent) => {
		if (e.target !== e.currentTarget) return;

		if (e.key === " ") {
			toggleCheck();
		} else if (e.key === "Enter") {
			if (node.isFolder) setExpanded(!expanded);
			else selectFile();
		} else if (e.key === "ArrowRight" && node.isFolder && !expanded) {
			setExpanded(true);
		} else if (e.key === "ArrowLeft" && node.isFolder && expanded) {
			setExpanded(false);
		} else {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
	};
</script>

{#if node.isFolder}
	<div
		class="dg-pc-folder"
		role="treeitem"
		aria-level={level}
		aria-expanded={expanded}
		aria-checked={checkable ? (partial ? "mixed" : allChecked) : undefined}
		aria-selected="false"
		aria-label={node.name}
		data-path={node.path}
		tabindex={focusPath === node.path ? 0 : -1}
		on:keydown={onKeydown}
		on:focus={(e) => {
			if (e.target === e.currentTarget)
				dispatch("focusrow", { path: node.path });
		}}
	>
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="dg-pc-row" on:click={() => setExpanded(!expanded)}>
			<span class="dg-pc-arrow" class:open={expanded}>
				<Icon name="chevron-right" />
			</span>
			{#if checkable}
				<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
				<label class="dg-pc-check" on:click|stopPropagation>
					<input
						type="checkbox"
						tabindex="-1"
						aria-hidden="true"
						checked={allChecked}
						use:indeterminate={partial}
						on:click|stopPropagation={toggleCheck}
					/>
				</label>
			{:else}
				<span class="dg-pc-check dg-pc-check-none"></span>
			{/if}
			<Icon name="folder" />
			<span class="dg-pc-name">{node.name}</span>
		</div>
		{#if expanded}
			<div class="dg-pc-children" role="group">
				{#each node.children ?? [] as child (child.path)}
					<svelte:self
						node={child}
						{selected}
						{activePath}
						{focusPath}
						level={level + 1}
						on:select
						on:toggle
						on:focusrow
					/>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<div
		class="dg-pc-row dg-pc-file"
		class:active={activePath === node.path}
		class:is-removing={node.status === "deleted" && fileChecked}
		role="treeitem"
		aria-level={level}
		aria-checked={checkable ? fileChecked : undefined}
		aria-selected={activePath === node.path}
		aria-label="{node.name}, {statusLabel}"
		data-path={node.path}
		tabindex={focusPath === node.path ? 0 : -1}
		title="{node.name}, {statusLabel}"
		on:click={selectFile}
		on:keydown={onKeydown}
		on:focus={() => dispatch("focusrow", { path: node.path })}
	>
		<span class="dg-pc-arrow-spacer"></span>
		{#if checkable}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
			<label class="dg-pc-check" on:click|stopPropagation>
				<input
					type="checkbox"
					tabindex="-1"
					aria-hidden="true"
					checked={fileChecked}
					on:click|stopPropagation={toggleCheck}
				/>
			</label>
		{:else}
			<span class="dg-pc-check dg-pc-check-none"></span>
		{/if}
		{#if node.status}
			<StatusDot status={node.status} />
		{/if}
		<span class="dg-pc-name">{node.name}</span>
	</div>
{/if}

<style>
	.dg-pc-folder:focus {
		outline: none;
	}

	.dg-pc-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 1px 2px;
		border-radius: var(--radius-s);
		cursor: pointer;
		user-select: none;
	}

	/* Thumb-sized rows on phones and tablets. */
	:global(.is-mobile) .dg-pc-row {
		min-height: 44px;
		padding-block: 4px;
	}

	@media (hover: hover) {
		.dg-pc-row:hover {
			background: var(--background-modifier-hover);
		}
	}

	.dg-pc-check {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
	}

	.dg-pc-check input {
		margin: 0;
	}

	/* Holds the checkbox column so published names line up with the rest. */
	.dg-pc-check-none {
		width: var(--checkbox-size, 15px);
		flex: 0 0 auto;
		cursor: inherit;
	}

	:global(.is-mobile) .dg-pc-check-none {
		box-sizing: content-box;
	}

	/* The checkbox gets its own 44px target, apart from the row (which
	   opens the diff). */
	:global(.is-mobile) .dg-pc-check {
		align-self: stretch;
		padding-inline: 13px;
		margin-inline: -9px;
	}

	/* Ticked for removal: struck through, so "Remove 2" can be traced. */
	.dg-pc-file.is-removing .dg-pc-name {
		text-decoration: line-through;
		text-decoration-color: var(--text-error);
		color: var(--text-muted);
	}

	.dg-pc-file.active {
		background: var(--background-modifier-active-hover);
	}

	.dg-pc-file:focus {
		outline: none;
	}

	.dg-pc-file:focus-visible,
	.dg-pc-folder:focus-visible > .dg-pc-row {
		box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
	}

	.dg-pc-children {
		padding-left: 1.1rem;
	}

	.dg-pc-arrow {
		display: inline-flex;
		color: var(--text-muted);
		transition: transform 100ms;
	}

	.dg-pc-arrow.open {
		transform: rotate(90deg);
	}

	.dg-pc-arrow-spacer {
		width: var(--icon-size);
		display: inline-block;
		flex: 0 0 auto;
	}

	.dg-pc-name {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* No hover title on touch: long names wrap instead. */
	:global(.is-mobile) .dg-pc-name {
		white-space: normal;
		overflow-wrap: anywhere;
	}
</style>
