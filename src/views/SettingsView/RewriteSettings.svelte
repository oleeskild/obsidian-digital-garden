<script lang="ts">
	import Publisher from "src/publisher/Publisher";

	import { ChangeEventHandler } from "svelte/elements";
	import { getGardenPathForNote, getRewriteRules } from "../../utils/utils";
	import DigitalGardenSettings from "../../models/settings";
	import { Change, diffLines } from "diff";
	import LineDiff from "../../ui/LineDiff.svelte";

	export let publisher: Publisher;
	export let settings: DigitalGardenSettings;
	export let closeModal: () => void;

	let newPathRewriteRules: string;
	let diff: Change[][] = [];
	let saveDisabled: boolean = true;

	const onChange: ChangeEventHandler<HTMLTextAreaElement> = async (event) => {
		saveDisabled = false;
		newPathRewriteRules = event.currentTarget.value;

		const paths = await getPathsForRewriteRules(
			newPathRewriteRules,
			settings.pathRewriteRules,
		);

		diff = paths
			.map((path) => diffLines(path.oldPath, path.newPath))
			// filter non-changed
			.filter((diff) => diff.length > 1);
	};

	const getPathsForRewriteRules = async (
		newRules: string,
		oldRules: string,
	) => {
		const newRewriteRules = getRewriteRules(newRules);
		const oldRewriteRules = getRewriteRules(oldRules);
		const files = await publisher.getFilesMarkedForPublishing();

		const paths = files.notes.map((note) => ({
			id: note.file.path,
			newPath: getGardenPathForNote(note.file.path, newRewriteRules),
			oldPath: getGardenPathForNote(note.file.path, oldRewriteRules),
		}));

		return paths;
	};
</script>

<div>
	<h1>Path rewrite rules</h1>
	<div class="setting-item-description">
		Define rules to rewrite note paths/folder structure, using following
		syntax:
	</div>
	<ol class="setting-item-description">
		<li>One rule-per line</li>
		<li>The format is [from_vault_path]:[to_garden_path]</li>
		<li>Matching will exit on first match</li>
	</ol>
	<div class="setting-item-description">
		Example: If you want the vault folder "Personal/Journal" to be shown as
		only "Journal" in the left file sidebar in the garden, add the line
		"Personal/Journal:Journal"
	</div>
	<div class="setting-item-description">
		To define a folder as the root folder for the garden, use
		`[from_vault_path]:`
	</div>
	<div class="setting-item-description">
		Saving will not update the garden directly, and changes will be visible
		in the publication center.
	</div>
	<div class="setting-item">
		<textarea
			value={settings.pathRewriteRules}
			placeholder="Personal/Journal:Journal"
			rows="10"
			cols="5"
			on:input={onChange}
		/>
	</div>
	<div class="setting-item-description changes">
		{#if diff.length > 0}
			{diff.length} notes will be affected by the change:
		{:else}
			No notes will be affected by the change
		{/if}
		<code>
			{#each diff as change}
				<LineDiff diff={change} />
			{/each}
		</code>
	</div>
	<button
		on:click={() => {
			settings.pathRewriteRules = newPathRewriteRules;
			closeModal();
		}}
		disabled={saveDisabled}>Save</button
	>

	<button on:click={closeModal}>Cancel</button>
</div>

<style>
	.setting-item {
		display: flex;
		flex-direction: column;
	}

	.changes {
		max-height: 100px;
		overflow-y: scroll;
	}

	textarea {
		width: 100%;
	}
</style>
