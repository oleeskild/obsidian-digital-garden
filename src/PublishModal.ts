import type DigitalGardenSettings from "src/DigitalGardenSettings";
import { type App, ButtonComponent, Modal } from "obsidian";
import Publisher from "./Publisher";
import PublishStatusManager from "./PublishStatusManager";

export class PublishModal {
	modal: Modal;
	settings: DigitalGardenSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;

	publishedContainer!: HTMLElement;
	publishedContainerCount!: HTMLElement;
	changedContainer!: HTMLElement;
	changedContainerCount!: HTMLElement;
	deletedContainer!: HTMLElement;
	deletedContainerCount!: HTMLElement;
	unpublishedContainer!: HTMLElement;
	unpublishedContainerCount!: HTMLElement;

	progressContainer!: HTMLElement;

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

	createCollapsable(
		title: string,
		buttonText?: string,
		buttonCallback?: () => Promise<void>,
	): HTMLElement[] {
		const headerContainer = this.modal.contentEl.createEl("div", {
			attr: {
				style: "display: flex; justify-content: space-between; margin-bottom: 10px; align-items:center",
			},
		});

		const titleContainer = headerContainer.createEl("div", {
			attr: { style: "display: flex; align-items:center" },
		});

		const toggleHeader = titleContainer.createEl("h3", {
			text: `➕️ ${title}`,
			attr: { class: "collapsable collapsed" },
		});

		const counter = titleContainer.createEl("span", {
			attr: { class: "count", style: "margin-left:10px" },
		});

		if (buttonText && buttonCallback) {
			const button = new ButtonComponent(headerContainer)
				.setButtonText(buttonText)
				.onClick(async () => {
					button.setDisabled(true);
					await buttonCallback();
					button.setDisabled(false);
				});
		}

		const toggledList = this.modal.contentEl.createEl("ul");
		toggledList.hide();

		headerContainer.onClickEvent(() => {
			if (toggledList.isShown()) {
				toggleHeader.textContent = `➕️ ${title}`;
				toggledList.hide();
				toggleHeader.removeClass("open");
				toggleHeader.addClass("collapsed");
			} else {
				toggleHeader.textContent = `➖ ${title}`;
				toggledList.show();
				toggleHeader.removeClass("collapsed");
				toggleHeader.addClass("open");
			}
		});
		return [counter, toggledList];
	}

	async initialize() {
		this.modal.titleEl.innerText = "🌱 Digital Garden";

		this.modal.contentEl.addClass("digital-garden-publish-status-view");
		this.modal.contentEl.createEl("h2", { text: "Publication Status" });

		this.progressContainer = this.modal.contentEl.createEl("div", {
			attr: { style: "height: 30px;" },
		});

		[this.publishedContainerCount, this.publishedContainer] =
			this.createCollapsable("Published");
		[this.changedContainerCount, this.changedContainer] =
			this.createCollapsable(
				"Changed",
				"Update changed files",
				async () => {
					const publishStatus =
						await this.publishStatusManager.getPublishStatus();
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

					await this.refreshView();
				},
			);

		[this.deletedContainerCount, this.deletedContainer] =
			this.createCollapsable(
				"Deleted from vault",
				"Delete notes from garden",
				async () => {
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

					await this.refreshView();
				},
			);
		[this.unpublishedContainerCount, this.unpublishedContainer] =
			this.createCollapsable(
				"Unpublished",
				"Publish unpublished notes",
				async () => {
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
			);

		this.modal.onOpen = async () => {
			await this.refreshView();
		};
		this.modal.onClose = async () => {
			await this.clearView();
		};
	}

	async clearView() {
		this.publishedContainerCount.textContent = ``;
		this.changedContainerCount.textContent = ``;
		this.deletedContainerCount.textContent = ``;
		this.unpublishedContainerCount.textContent = ``;
		while (this.publishedContainer.lastElementChild) {
			this.publishedContainer.removeChild(
				this.publishedContainer.lastElementChild,
			);
		}
		while (this.changedContainer.lastElementChild) {
			this.changedContainer.removeChild(
				this.changedContainer.lastElementChild,
			);
		}
		while (this.deletedContainer.lastElementChild) {
			this.deletedContainer.removeChild(
				this.deletedContainer.lastElementChild,
			);
		}
		while (this.unpublishedContainer.lastElementChild) {
			this.unpublishedContainer.removeChild(
				this.unpublishedContainer.lastElementChild,
			);
		}
	}

	async populateWithNotes() {
		this.progressContainer.innerText = `⌛ Loading publication status`;
		const publishStatus =
			await this.publishStatusManager.getPublishStatus();
		this.progressContainer.innerText = ``;
		publishStatus.publishedNotes.map((file) =>
			this.publishedContainer.createEl("li", { text: file.path }),
		);
		this.publishedContainerCount.textContent = `(${publishStatus.publishedNotes.length} notes)`;
		publishStatus.unpublishedNotes.map((file) =>
			this.unpublishedContainer.createEl("li", { text: file.path }),
		);
		this.unpublishedContainerCount.textContent = `(${publishStatus.unpublishedNotes.length} notes)`;
		publishStatus.changedNotes.map((file) =>
			this.changedContainer.createEl("li", { text: file.path }),
		);
		this.changedContainerCount.textContent = `(${publishStatus.changedNotes.length} notes)`;
		publishStatus.deletedNotePaths.map((path) =>
			this.deletedContainer.createEl("li", { text: path }),
		);
		this.deletedContainerCount.textContent = `(${publishStatus.deletedNotePaths.length} notes)`;
	}

	private async refreshView() {
		this.clearView();
		await this.populateWithNotes();
	}

	open() {
		this.modal.open();
	}
}
