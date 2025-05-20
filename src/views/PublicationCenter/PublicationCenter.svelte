<script lang="ts">
	import { getIcon } from "obsidian";
	import TreeNode from "../../models/TreeNode";
	import {
		IPublishStatusManager,
		PublishStatus,
	} from "../../publisher/PublishStatusManager";
	import TreeView from "src/ui/TreeView/TreeView.svelte";
	import { onMount } from "svelte";
	import Publisher from "src/publisher/Publisher";
	import Icon from "../../ui/Icon.svelte";
	import { CompiledPublishFile } from "src/publishFile/PublishFile";
	export let publishStatusManager: IPublishStatusManager;
	export let publisher: Publisher;
	export let showDiff: (path: string) => void;
	export let close: () => void;

	let publishStatus: PublishStatus;
	let showPublishingView: boolean = false;

	async function getPublishStatus() {
		publishStatus = await publishStatusManager.getPublishStatus();
	}

	onMount(getPublishStatus);

	function insertIntoTree(tree: TreeNode, pathComponents: string[]): void {
		let currentNode = tree;

		for (let i = 0; i < pathComponents.length; i++) {
			const part = pathComponents[i];

			if (!currentNode.children) {
				currentNode.children = [];
			}

			let childNode = currentNode.children.find(
				(child) => child.name === part,
			);

			if (!childNode) {
				childNode = {
					name: part,
					isRoot: false,
					path: pathComponents.slice(0, i + 1).join("/"),
					indeterminate: false,
					checked: false,
				};
				currentNode.children.push(childNode);
			}

			currentNode = childNode;
		}
	}

	function filePathsToTree(
		filePaths: string[],
		rootName: string = "root",
	): TreeNode {
		const root: TreeNode = {
			name: rootName,
			isRoot: true,
			path: "/",
			indeterminate: false,
			checked: false,
		};

		for (const filePath of filePaths) {
			const pathComponents = filePath.split("/");
			insertIntoTree(root, pathComponents);
		}

		return root;
	}

	const rotatingCog = () => {
		let cog = getIcon("cog");
		cog?.classList.add("quartz-syncer-rotate");
		cog?.style.setProperty("margin-right", "3px");

		return cog;
	};
	//TODO: move to class
	const bigRotatingCog = () => {
		let cog = getIcon("cog");
		cog?.classList.add("quartz-syncer-rotate");
		cog?.style.setProperty("margin-right", "3px");
		cog?.style.setProperty("width", "40px");
		cog?.style.setProperty("height", "40px");

		return cog;
	};

	$: publishedNotesTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.publishedNotes.map((note) => note.getVaultPath()),
			"Unchanged notes" +
				(publishStatus.publishedNotes.length > 0
					? ` (${
							publishStatus.publishedNotes.length === 1
								? "1 note"
								: `${publishStatus.publishedNotes.length} notes`
					  })`
					: ""),
		);

	$: changedNotesTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.changedNotes.map((note) => note.getVaultPath()),
			"Changed notes" +
				(publishStatus.changedNotes.length > 0
					? ` (${
							publishStatus.changedNotes.length === 1
								? "1 note"
								: `${publishStatus.changedNotes.length} notes`
					  })`
					: ""),
		);

	$: deletedNoteTree =
		publishStatus &&
		filePathsToTree(
			[
				...publishStatus.deletedNotePaths,
				...publishStatus.deletedBlobPaths,
			].map((path) => path.path),
			"Published notes (select to unpublish)" +
				(publishStatus.changedNotes.length +
					publishStatus.publishedNotes.length >
				0
					? ` (${
							publishStatus.changedNotes.length +
								publishStatus.publishedNotes.length ===
							1
								? "1 note"
								: `${
										publishStatus.changedNotes.length +
										publishStatus.publishedNotes.length
								  } notes`
					  })`
					: ""),
		);

	$: unpublishedNoteTree =
		publishStatus &&
		filePathsToTree(
			publishStatus.unpublishedNotes.map((note) => note.getVaultPath()),
			"Unpublished notes" +
				(publishStatus.unpublishedNotes.length > 0
					? ` (${
							publishStatus.unpublishedNotes.length === 1
								? "1 note"
								: `${publishStatus.unpublishedNotes.length} notes`
					  })`
					: ""),
		);

	$: publishProgress =
		((publishedPaths.length + failedPublish.length) /
			(unpublishedToPublish.length +
				changedToPublish.length +
				pathsToDelete.length)) *
		100;

	const traverseTree = (tree: TreeNode): Array<string> => {
		const paths: Array<string> = [];

		if (tree.children) {
			for (const child of tree.children) {
				paths.push(...traverseTree(child));
			}
		} else {
			if (tree.checked) {
				paths.push(tree.path);
			}
		}

		return paths;
	};

	let unpublishedToPublish: Array<CompiledPublishFile> = [];
	let changedToPublish: Array<CompiledPublishFile> = [];
	let pathsToDelete: Array<string> = [];

	let processingPaths: Array<string> = [];
	let publishedPaths: Array<string> = [];
	let failedPublish: Array<string> = [];

	const publishMarkedNotes = async () => {
		if (!unpublishedNoteTree || !changedNotesTree) return;

		if (!publishStatus) {
			throw new Error("Publish status is undefined");
		}

		const unpublishedPaths = traverseTree(unpublishedNoteTree!);
		const changedPaths = traverseTree(changedNotesTree!);

		pathsToDelete = traverseTree(deletedNoteTree!);

		const notesToDelete = pathsToDelete.filter((path) =>
			publishStatus.deletedNotePaths.some((p) => p.path === path),
		);

		const blobsToDelete = pathsToDelete.filter((path) =>
			publishStatus.deletedBlobPaths.some((p) => p.path === path),
		);

		unpublishedToPublish =
			publishStatus.unpublishedNotes.filter((note) =>
				unpublishedPaths.includes(note.getVaultPath()),
			) ?? [];

		changedToPublish =
			publishStatus?.changedNotes.filter((note) =>
				changedPaths.includes(note.getVaultPath()),
			) ?? [];

		showPublishingView = true;

		const allNotesToPublish = unpublishedToPublish.concat(changedToPublish);

		processingPaths = [
			...allNotesToPublish.map((note) => note.getVaultPath()),
		];
		await publisher.publishBatch(allNotesToPublish);

		publishedPaths = [...processingPaths];
		processingPaths = [];

		processingPaths = [...notesToDelete, ...blobsToDelete];
		await publisher.deleteBatch(notesToDelete);

		processingPaths = processingPaths.filter(
			(p) => !notesToDelete.includes(p),
		);
		publishedPaths = [...publishedPaths, ...notesToDelete];

		processingPaths = [...blobsToDelete];
		await publisher.deleteBatch(blobsToDelete);

		processingPaths = processingPaths.filter(
			(p) => !blobsToDelete.includes(p),
		);
		publishedPaths = [...publishedPaths, ...blobsToDelete];

		publishedPaths = [...publishedPaths, ...processingPaths];
		processingPaths = [];
	};

	const emptyNode: TreeNode = {
		name: "",
		isRoot: false,
		path: "",
		indeterminate: false,
		checked: false,
	};
</script>

<div>
	<hr class="title-separator" />
	{#if !publishStatus}
		<div class="loading-msg">
			{@html bigRotatingCog()?.outerHTML}
			<div>Calculating publication status from GitHub</div>
		</div>
	{:else if !showPublishingView}
		<TreeView tree={unpublishedNoteTree ?? emptyNode} {showDiff} />

		<TreeView
			tree={changedNotesTree ?? emptyNode}
			{showDiff}
			enableShowDiff={true}
		/>

		<TreeView tree={deletedNoteTree ?? emptyNode} {showDiff} />

		<TreeView
			readOnly={true}
			tree={publishedNotesTree ?? emptyNode}
			{showDiff}
		/>

		<hr class="footer-separator" />

		<div class="footer">
			<button on:click={publishMarkedNotes}
				>PUBLISH SELECTED CHANGES</button
			>
		</div>
	{:else}
		<div>
			<div class="callout">
				<div class="callout-title-inner">Publishing Notes</div>
				<div>
					{`${publishedPaths.length} of ${
						unpublishedToPublish.length +
						changedToPublish.length +
						pathsToDelete.length
					} notes published`}
				</div>

				{#if failedPublish.length > 0}
					<div>
						{`(${failedPublish.length} failed)`}
					</div>
				{/if}
				<div class="loading-container">
					<div
						class="loading-bar"
						style="width: {publishProgress}%"
					/>
				</div>
			</div>

			{#each unpublishedToPublish.concat(changedToPublish) as note}
				<div class="note-list">
					{#if processingPaths.includes(note.getVaultPath())}
						{@html rotatingCog()?.outerHTML}
					{:else if publishedPaths.includes(note.getVaultPath())}
						<Icon name="check" />
					{:else if failedPublish.includes(note.getVaultPath())}
						<Icon name="cross" />
					{:else}
						<Icon name="clock" />
					{/if}
					{note.file.name}
					{#if publishedPaths.includes(note.getVaultPath())}
						<span class="published"> - PUBLISHED</span>
					{/if}
				</div>
			{/each}

			{#each pathsToDelete as path}
				<div class="note-list">
					{#if processingPaths.includes(path)}
						{@html rotatingCog()?.outerHTML}
					{:else if publishedPaths.includes(path)}
						<Icon name="check" />
					{:else}
						<Icon name="clock" />
					{/if}
					{path.split("/").last()}

					{#if publishedPaths.includes(path)}
						<span class="deleted"> - DELETED</span>
					{/if}
				</div>
			{/each}

			<hr class="footer-separator" />

			<div class="footer">
				<button on:click={close}>DONE</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.title-separator {
		margin-top: 0px;
		margin-bottom: 15px;
	}

	.footer-separator {
		margin-top: 15px;
		margin-bottom: 15px;
	}

	.footer {
		display: flex;
		justify-content: flex-end;
	}

	.loading-msg {
		font-size: 1.2rem;
		display: flex;
		align-items: center;
		flex-direction: column;
	}
	button {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
		cursor: pointer;
		font-weight: bold;
	}
	.loading-container {
		width: 100%;
		height: 5px;
		margin-top: 10px;
	}

	.loading-bar {
		background-color: var(--interactive-accent);
		height: 100%;
		transition: all 0.5s ease-in-out;
	}
	.published {
		color: #8bff8b;
	}
	.deleted {
		color: #ff5757;
	}
</style>
