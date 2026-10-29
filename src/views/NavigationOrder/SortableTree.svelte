<script lang="ts">
	import { onMount, onDestroy, tick } from "svelte";
	import Sortable from "sortablejs";
	import Icon from "../../ui/Icon.svelte";

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
	// Read out after a keyboard move.
	let announcement = "";

	function toggleFolder(name: string) {
		if (expandedFolders.has(name)) {
			expandedFolders.delete(name);
		} else {
			expandedFolders.add(name);
		}

		expandedFolders = expandedFolders;
	}

	/** The keyboard alternative to dragging. Keeps focus on the moved item. */
	async function move(index: number, delta: -1 | 1, control: "up" | "down") {
		const target = index + delta;

		if (target < 0 || target >= items.length) return;

		const [moved] = items.splice(index, 1);
		items.splice(target, 0, moved);
		items = items;

		announcement = `${moved.name} moved to position ${target + 1} of ${
			items.length
		}.`;

		await tick();

		const row = listEl.querySelector<HTMLElement>(
			`:scope > [data-name="${CSS.escape(moved.name)}"]`,
		);

		// At the top or bottom that button is disabled; use the other one.
		const atEdge = target === 0 || target === items.length - 1;
		const next = atEdge ? (control === "up" ? "down" : "up") : control;

		row
			?.querySelector<HTMLElement>(`:scope > .item-row .dg-move-${next}`)
			?.focus();
	}

	function onRowKeydown(e: KeyboardEvent, index: number) {
		if (!e.altKey) return;

		if (e.key === "ArrowUp") {
			e.preventDefault();
			move(index, -1, "up");
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			move(index, 1, "down");
		}
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
	{#each items as item, index (item.name)}
		<div class="sortable-item" data-name={item.name}>
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="item-row"
				style:padding-left="{depth * 16 + 4}px"
				on:keydown={(e) => onRowKeydown(e, index)}
			>
				<span class="drag-handle" aria-hidden="true">
					<Icon name="grip-vertical" />
				</span>

				{#if item.isFolder}
					<button
						class="folder-toggle"
						aria-expanded={expandedFolders.has(item.name)}
						aria-label="{expandedFolders.has(item.name)
							? 'Collapse'
							: 'Expand'} {item.name}"
						on:click={() => toggleFolder(item.name)}
					>
						<span
							class="collapse-icon"
							class:expanded={expandedFolders.has(item.name)}
						>
							<Icon name="chevron-right" />
						</span>
					</button>
					<span class="item-icon" aria-hidden="true">
						<Icon name="folder" />
					</span>
				{:else}
					<span class="file-spacer"></span>
					<span class="item-icon" aria-hidden="true">
						<Icon name="file-text" />
					</span>
				{/if}

				<span class="item-name">{item.name}</span>

				<span class="move-buttons">
					<button
						class="clickable-icon dg-move-up"
						aria-label="Move {item.name} up"
						title="Move up (Alt+↑)"
						disabled={index === 0}
						on:click={() => move(index, -1, "up")}
					>
						<Icon name="arrow-up" />
					</button>
					<button
						class="clickable-icon dg-move-down"
						aria-label="Move {item.name} down"
						title="Move down (Alt+↓)"
						disabled={index === items.length - 1}
						on:click={() => move(index, 1, "down")}
					>
						<Icon name="arrow-down" />
					</button>
				</span>
			</div>

			{#if item.isFolder && expandedFolders.has(item.name)}
				<svelte:self bind:items={item.children} depth={depth + 1} />
			{/if}
		</div>
	{/each}
	<div class="dg-sr-only" aria-live="polite">{announcement}</div>
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
		gap: 6px;
		min-height: 32px;
		padding: 2px 4px;
		border-radius: var(--radius-s);
		cursor: default;
	}

	.item-row:hover {
		background: var(--background-modifier-hover);
	}

	.drag-handle {
		display: flex;
		flex: 0 0 auto;
		cursor: grab;
		color: var(--text-faint);
	}

	.drag-handle:hover {
		color: var(--text-normal);
	}

	.drag-handle :global(.svg-icon),
	.item-icon :global(.svg-icon),
	.collapse-icon :global(.svg-icon) {
		width: 14px;
		height: 14px;
	}

	/* Fixed size: Obsidian's mobile button styles would stretch it. */
	.folder-toggle {
		display: flex;
		flex: 0 0 20px;
		align-items: center;
		justify-content: center;
		width: 20px;
		min-width: 0;
		height: 20px;
		padding: 0;
		background: none;
		border: none;
		box-shadow: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.collapse-icon {
		display: flex;
		transition: transform 0.15s ease;
	}

	.collapse-icon.expanded {
		transform: rotate(90deg);
	}

	.file-spacer {
		flex: 0 0 20px;
	}

	.item-icon {
		display: flex;
		flex: 0 0 auto;
		color: var(--text-muted);
	}

	.item-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-ui-small);
	}

	.move-buttons {
		display: flex;
		flex: 0 0 auto;
		gap: 2px;
	}

	/* On a mouse, the arrows appear with the row; keyboard and touch
	   always see them. */
	@media (hover: hover) {
		.move-buttons {
			opacity: 0;
		}

		.item-row:hover .move-buttons,
		.item-row:focus-within .move-buttons {
			opacity: 1;
		}
	}

	.move-buttons button:disabled {
		visibility: hidden;
	}

	@media (prefers-reduced-motion: reduce) {
		.collapse-icon {
			transition: none;
		}
	}

	:global(.sortable-ghost) {
		opacity: 0.4;
		background: var(--background-modifier-active-hover);
	}

	:global(.sortable-chosen) {
		background: var(--background-modifier-hover);
	}
</style>
