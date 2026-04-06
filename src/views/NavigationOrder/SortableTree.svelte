<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Sortable from "sortablejs";

	interface TreeItem {
		name: string;
		isFolder: boolean;
		children: TreeItem[];
	}

	export let items: TreeItem[] = [];
	export let depth: number = 0;

	let listEl: HTMLElement;
	let sortableInstance: Sortable | null = null;
	let expandedFolders: Set<string> = new Set();

	function toggleFolder(name: string) {
		if (expandedFolders.has(name)) {
			expandedFolders.delete(name);
		} else {
			expandedFolders.add(name);
		}

		expandedFolders = expandedFolders;
	}

	function initSortable(el: HTMLElement) {
		sortableInstance = Sortable.create(el, {
			animation: 150,
			handle: ".drag-handle",
			ghostClass: "sortable-ghost",
			chosenClass: "sortable-chosen",
			group: {
				name: `level-${depth}`,
				pull: false,
				put: false,
			},
			onEnd: (evt) => {
				if (evt.oldIndex == null || evt.newIndex == null) return;

				if (evt.oldIndex === evt.newIndex) return;

				const moved = items.splice(evt.oldIndex, 1)[0];
				items.splice(evt.newIndex, 0, moved);
				items = items;
			},
		});
	}

	onMount(() => {
		if (listEl) {
			initSortable(listEl);
		}
	});

	onDestroy(() => {
		sortableInstance?.destroy();
	});
</script>

<div class="sortable-list" bind:this={listEl}>
	{#each items as item (item.name)}
		<div class="sortable-item" data-name={item.name}>
			<div class="item-row" style="padding-left: {depth * 16}px">
				<span class="drag-handle">⠿</span>

				{#if item.isFolder}
					<button
						class="folder-toggle"
						on:click={() => toggleFolder(item.name)}
					>
						<span
							class="collapse-icon"
							class:expanded={expandedFolders.has(item.name)}
						>
							›
						</span>
					</button>
					<span class="folder-icon">📁</span>
				{:else}
					<span class="file-spacer"></span>
					<span class="file-icon">📄</span>
				{/if}

				<span class="item-name">{item.name}</span>
			</div>

			{#if item.isFolder && expandedFolders.has(item.name)}
				<svelte:self bind:items={item.children} depth={depth + 1} />
			{/if}
		</div>
	{/each}
</div>

<style>
	.sortable-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sortable-item {
		user-select: none;
	}

	.item-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: var(--radius-s);
		cursor: default;
	}

	.item-row:hover {
		background: var(--background-modifier-hover);
	}

	.drag-handle {
		cursor: grab;
		opacity: 0.4;
		font-size: 14px;
		width: 16px;
		text-align: center;
	}

	.drag-handle:hover {
		opacity: 1;
	}

	.folder-toggle {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		width: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}

	.collapse-icon {
		display: inline-block;
		transition: transform 0.15s ease;
		font-size: 14px;
	}

	.collapse-icon.expanded {
		transform: rotate(90deg);
	}

	.file-spacer {
		width: 16px;
	}

	.folder-icon,
	.file-icon {
		font-size: 14px;
		width: 18px;
		text-align: center;
	}

	.item-name {
		font-size: var(--font-ui-small);
	}

	:global(.sortable-ghost) {
		opacity: 0.4;
		background: var(--background-modifier-active-hover);
	}

	:global(.sortable-chosen) {
		background: var(--background-modifier-hover);
	}
</style>
