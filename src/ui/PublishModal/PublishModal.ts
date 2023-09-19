import { type App, Modal, TFile } from "obsidian";
import Publisher from "../../publisher/Publisher";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import DigitalGardenSettings from "../../models/settings";
import { PublishModalItem } from "./PublishModalItem";

export class PublishModal {
	modal: Modal;
	settings: DigitalGardenSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;

	progressContainer: HTMLElement;

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

		this.progressContainer = this.modal.contentEl.createEl("div", {
			attr: { style: "height: 30px;" },
		});

		this.initialize();
	}

	async initialize() {
		this.modal.titleEl.innerText = "🌱 Digital Garden";

		this.modal.contentEl.addClass("digital-garden-publish-status-view");
		this.modal.contentEl.createEl("h2", { text: "Publication Status" });

		const publishModal = new PublishModalItem(
			this.modal.contentEl,
			"Published",
			(publishStatus) =>
				publishStatus.publishedNotes.map((note) => note.path),
		);

		const changedModal = new PublishModalItem(
			this.modal.contentEl,
			"Changed",
			(publishStatus) =>
				publishStatus.changedNotes.map((note) => note.path),
			{
				cta: "Publish changed notes",
				callback: async () => {
					const publishStatus =
						await this.publishStatusManager.getPublishStatus();

					const changed = publishStatus.changedNotes;

					await this.runWithProgress(
						"Publishing changed notes",
						(file: TFile) => this.publisher.publish(file),
						changed,
					);
					this.refreshView();
					this.setProgressSuccess(
						// NOTE: copies always indicate total success, but we could add partial success here
						`Published all changed notes: ${changed.length}/${changed.length}`,
					);
				},
			},
		);

		const deletedModal = new PublishModalItem(
			this.modal.contentEl,
			"Deleted from vault",
			(publishStatus) =>
				publishStatus.deletedNotePaths.map((note) => note),
			{
				cta: "Delete notes from garden",
				callback: async () => {
					const deletedNotes =
						await this.publishStatusManager.getDeletedNotePaths();

					await this.runWithProgress(
						"Deleting Notes",
						(path: string) => this.publisher.deleteNote(path),
						deletedNotes,
					);

					this.refreshView();
					this.setProgressSuccess(
						`Deleted all notes: ${deletedNotes.length}/${deletedNotes.length}`,
					);
				},
			},
		);

		const unpublishedModal = new PublishModalItem(
			this.modal.contentEl,
			"Unpublished",
			(publishStatus) =>
				publishStatus.unpublishedNotes.map((note) => note.path),
			{
				cta: "Publish unpublished notes",
				callback: async () => {
					const publishStatus =
						await this.publishStatusManager.getPublishStatus();
					const unpublished = publishStatus.unpublishedNotes;

					await this.runWithProgress(
						"Publishing unpublished notes",
						(file: TFile) => this.publisher.publish(file),
						unpublished,
					);

					await this.refreshView();
					this.setProgressSuccess(
						`Published all unpublished notes: ${unpublished.length}/${unpublished.length}`,
					);
				},
			},
		);

		this.items = [
			publishModal,
			changedModal,
			deletedModal,
			unpublishedModal,
		];

		this.refreshView();

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

	private setProgressSuccess(text: string) {
		this.progressContainer.innerText = `✅ ${text}`;
		setTimeout(() => {
			if (this.progressContainer.innerText === `✅ ${text}`) {
				this.progressContainer.innerText = ``;
			}
		}, 5000);
	}

	private async runWithProgress<TItemType>(
		text: string,
		callback: (item: TItemType) => Promise<unknown>,
		items: TItemType[],
	) {
		for (const index in items) {
			const item = items[index];
			this.progressContainer.innerText = `⌛ ${text}: ${index}/${items.length}`;
			// to set partial success, or inform the user of failures, try/catch here and set a different copy
			await callback(item);
		}
	}

	open() {
		this.modal.open();
	}
}
