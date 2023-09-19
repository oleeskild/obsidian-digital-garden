import { type App, Modal } from "obsidian";
import Publisher from "../../publisher/Publisher";
import PublishStatusManager, {
	PublishStatus,
} from "../../publisher/PublishStatusManager";
import DigitalGardenSettings from "../../models/settings";
import { PublishModalItem } from "./PublishModalItem";

export class PublishModal {
	modal: Modal;
	settings: DigitalGardenSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;

	progressContainer!: HTMLElement;

	items: PublishModalItem[] = [];

	constructor(
		app: App,
		publishStatusManager: PublishStatusManager,
		publisher: Publisher,
		settings: DigitalGardenSettings,
	) {
		this.modal = new Modal(app);
		this.settings = settings;
		this.publishStatusManager = publishStatusManager;
		this.publisher = publisher;

		this.initialize();
	}

	async initialize() {
		this.modal.titleEl.innerText = "🌱 Digital Garden";

		this.modal.contentEl.addClass("digital-garden-publish-status-view");
		this.modal.contentEl.createEl("h2", { text: "Publication Status" });

		this.progressContainer = this.modal.contentEl.createEl("div", {
			attr: { style: "height: 30px;" },
		});

		const publishStatus =
			await this.publishStatusManager.getPublishStatus();

		const publishModal = new PublishModalItem(
			this.modal.contentEl,
			"Published",
			(publishStatus: PublishStatus) =>
				publishStatus.publishedNotes.map((note) => note.path),
		);

		const changedModal = new PublishModalItem(
			this.modal.contentEl,
			"Changed",
			(publishStatus: PublishStatus) =>
				publishStatus.changedNotes.map((note) => note.path),
			{
				cta: "Publish changed notes",
				callback: async () => {
					const changed = publishStatus.changedNotes;
					let counter = 0;
					for (const note of changed) {
						this.progressContainer.innerText = `⌛ Publishing changed notes: ${++counter}/${
							changed.length
						}`;
						await this.publisher.publish(note);
					}

					const publishedText = `✅ Published all changed notes: ${counter}/${changed.length}`;
					this.progressContainer.innerText = publishedText;
					setTimeout(() => {
						if (
							this.progressContainer.innerText === publishedText
						) {
							this.progressContainer.innerText = "";
						}
					}, 5000);
				},
			},
		);

		const deletedModal = new PublishModalItem(
			this.modal.contentEl,
			"Deleted from vault",
			(publishStatus: PublishStatus) =>
				publishStatus.deletedNotePaths.map((note) => note),
			{
				cta: "Delete notes from garden",
				callback: async () => {
					const deletedNotes =
						await this.publishStatusManager.getDeletedNotePaths();
					let counter = 0;
					for (const note of deletedNotes) {
						this.progressContainer.innerText = `⌛ Deleting Notes: ${++counter}/${
							deletedNotes.length
						}`;
						await this.publisher.deleteNote(note);
					}

					const deleteDoneText = `✅ Deleted all notes: ${counter}/${deletedNotes.length}`;
					this.progressContainer.innerText = deleteDoneText;
					setTimeout(() => {
						if (
							this.progressContainer.innerText === deleteDoneText
						) {
							this.progressContainer.innerText = "";
						}
					}, 5000);
				},
			},
		);

		const unpublishedModal = new PublishModalItem(
			this.modal.contentEl,
			"Unpublished",
			(publishStatus: PublishStatus) =>
				publishStatus.unpublishedNotes.map((note) => note.path),
			{
				cta: "Publish unpublished notes",
				callback: async () => {
					const publishStatus =
						await this.publishStatusManager.getPublishStatus();
					const unpublished = publishStatus.unpublishedNotes;
					let counter = 0;
					for (const note of unpublished) {
						this.progressContainer.innerText = `⌛ Publishing unpublished notes: ${++counter}/${
							unpublished.length
						}`;
						await this.publisher.publish(note);
					}
					const publishDoneText = `✅ Published all unpublished notes: ${counter}/${unpublished.length}`;
					this.progressContainer.innerText = publishDoneText;
					setTimeout(() => {
						if (
							this.progressContainer.innerText === publishDoneText
						) {
							this.progressContainer.innerText = "";
						}
					}, 5000);
					await this.refreshView();
				},
			},
		);

		this.items = [
			publishModal,
			changedModal,
			deletedModal,
			unpublishedModal,
		];

		this.modal.onOpen = async () => {
			await this.refreshView();
		};
		this.modal.onClose = async () => {
			await this.clearView();
		};
	}

	async clearView() {
		for (const item of this.items) {
			item.clear();
		}
	}

	async populateWithNotes() {
		this.progressContainer.innerText = `⌛ Loading publication status`;
		const publishStatus =
			await this.publishStatusManager.getPublishStatus();
		this.progressContainer.innerText = ``;

		for (const item of this.items) {
			item.populateNotes(publishStatus);
		}
	}

	private async refreshView() {
		this.clearView();
		await this.populateWithNotes();
	}

	open() {
		this.modal.open();
	}
}
