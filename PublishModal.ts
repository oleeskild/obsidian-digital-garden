import DigitalGardenSettings from "DigitalGardenSettings";
import { IDigitalGardenSiteManager } from "DigitalGardenSiteManager";
import { App, Modal, TFile } from "obsidian";
import { IPublisher } from "Publisher";
import { IPublishStatusManager } from "PublishStatusManager";
import { generateBlobHash } from "utils";

export class PublishModal {
    modal: Modal;
    settings: DigitalGardenSettings;
    publishStatusManager: IPublishStatusManager;

    publishedContainer: HTMLElement;
    changedContainer: HTMLElement;
    deletedContainer: HTMLElement;
    unpublishedContainer: HTMLElement;

    constructor(app: App, publishStatusManager: IPublishStatusManager, settings: DigitalGardenSettings) {
        this.modal = new Modal(app)
        this.settings = settings;
        this.publishStatusManager = publishStatusManager;

        this.initialize();
    }

    createCollapsable(title: string): HTMLElement {
        const toggleHeader = this.modal.contentEl.createEl("h3", { text: `➕️ ${title}`, attr: { class: "collapsable collapsed" } });
        const toggledList = this.modal.contentEl.createEl("ul");
        toggledList.hide();

        toggleHeader.onClickEvent(() => {
            if (toggledList.isShown()) {
                toggleHeader.textContent = `➕️ ${title}`;
                toggledList.hide();
                toggleHeader.removeClass("open");
                toggleHeader.addClass("collapsed");
            } else {
                toggleHeader.textContent = `➖ ${title}`;
                toggledList.show()
                toggleHeader.removeClass("collapsed");
                toggleHeader.addClass("open");
            }
        });
        return toggledList;

    }

    async initialize() {
        this.modal.titleEl.innerText = "🌱 Digital Garden";

        this.modal.contentEl.addClass("digital-garden-publish-status-view");
        this.modal.contentEl.createEl("h2", { text: "Publication Status" });

        this.publishedContainer = this.createCollapsable("Published");
        this.changedContainer = this.createCollapsable("Changed");
        this.deletedContainer = this.createCollapsable("Deleted from vault");
        this.unpublishedContainer = this.createCollapsable("Unpublished");

        this.modal.onOpen = () => this.populateWithNotes();
        this.modal.onClose = () => this.clearView();
    }

    async clearView() {
        while (this.publishedContainer.lastElementChild) {
            this.publishedContainer.removeChild(this.publishedContainer.lastElementChild);
        }
        while (this.changedContainer.lastElementChild) {
            this.changedContainer.removeChild(this.changedContainer.lastElementChild);
        }
        while (this.deletedContainer.lastElementChild) {
            this.deletedContainer.removeChild(this.deletedContainer.lastElementChild);
        }
        while (this.unpublishedContainer.lastElementChild) {
            this.unpublishedContainer.removeChild(this.unpublishedContainer.lastElementChild);
        }
    }
    async populateWithNotes() {
        const publishStatus = await this.publishStatusManager.getPublishStatus();
        publishStatus.publishedNotes.map(file => this.publishedContainer.createEl("li", { text: file.path }));
        publishStatus.unpublishedNotes.map(file => this.unpublishedContainer.createEl("li", { text: file.path }));
        publishStatus.changedNotes.map(file => this.changedContainer.createEl("li", { text: file.path }));
        publishStatus.deletedNotePaths.map(path => this.deletedContainer.createEl("li", { text: path }));
    }

    open() {
        this.modal.open();
    }
}