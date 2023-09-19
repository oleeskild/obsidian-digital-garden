import { type App, ButtonComponent, Modal, TFile } from "obsidian";
import Publisher from "../publisher/Publisher";
import PublishStatusManager, {
	PublishStatus,
} from "../publisher/PublishStatusManager";
import DigitalGardenSettings from "../models/settings";

class PublishModalItem {
	private button: ButtonComponent | undefined;
	private countElement: HTMLElement;

	constructor(
		parent: HTMLElement,
		title: string,
		buttonProps?: {
			cta: string;
			callback: (modalItem: PublishModalItem) => Promise<void>;
		},
	) {
		const headerContainer = parent.createEl("div", {
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

		if (buttonProps) {
			const button = new ButtonComponent(headerContainer)
				.setButtonText(buttonProps.cta)
				.onClick(async () => {
					button.setDisabled(true);
					await buttonProps.callback(this);
					button.setDisabled(false);
				});
			this.button = button;
		}

		const toggledList = parent.createEl("ul");
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
		this.countElement = counter;
	}
}

const MODAL_PARTS: {
	name: string;
	getNotes: (publishStatus: PublishStatus) => TFile[] | string[];
	getSection: (publishModal: PublishModal) => HTMLElement;
	getCountSection: (publishModal: PublishModal) => HTMLElement;
}[] = [
	{
		name: "published",
		getNotes: (publishStatus: PublishStatus) =>
			publishStatus.publishedNotes,
		getSection: (publishModal: PublishModal) =>
			publishModal.publishedContainer,
		getCountSection: (publishModal: PublishModal) =>
			publishModal.publishedContainerCount,
	},
	{
		name: "changed",
		getNotes: (publishStatus: PublishStatus) => publishStatus.changedNotes,
		getSection: (publishModal: PublishModal) =>
			publishModal.changedContainer,
		getCountSection: (publishModal: PublishModal) =>
			publishModal.changedContainerCount,
	},
	{
		name: "deleted",
		getNotes: (publishStatus: PublishStatus) =>
			publishStatus.deletedNotePaths,
		getSection: (publishModal: PublishModal) =>
			publishModal.deletedContainer,
		getCountSection: (publishModal: PublishModal) =>
			publishModal.deletedContainerCount,
	},
	{
		name: "unpublished",
		getNotes: (publishStatus: PublishStatus) =>
			publishStatus.unpublishedNotes,
		getSection: (publishModal: PublishModal) =>
			publishModal.unpublishedContainer,
		getCountSection: (publishModal: PublishModal) =>
			publishModal.unpublishedContainerCount,
	},
];

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

		const publishModal = new PublishModalItem(
			this.modal.contentEl,
			"Published",
		);

		const changedModal = new PublishModalItem(
			this.modal.contentEl,
			"Changed",
			{
				cta: "Publish changed notes",
				callback: async () => {
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
				},
			},
		);

		const deletedModal = new PublishModalItem(
			this.modal.contentEl,
			"Deleted from vault",
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
		for (const part of MODAL_PARTS) {
			const section = part.getSection(this);
			const countSection = part.getCountSection(this);
			section.empty();
			countSection.textContent = "";
		}
	}

	async populateWithNotes() {
		this.progressContainer.innerText = `⌛ Loading publication status`;
		const publishStatus =
			await this.publishStatusManager.getPublishStatus();
		this.progressContainer.innerText = ``;

		for (const part of MODAL_PARTS) {
			const notes = part.getNotes(publishStatus);
			const section = part.getSection(this);
			const countSection = part.getCountSection(this);
			notes.map((file) =>
				section.createEl("li", {
					text: (file as TFile)?.path || (file as string),
				}),
			);
			countSection.textContent = `(${notes.length} notes)`;
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
