import DigitalGardenSettings from "src/DigitalGardenSettings";
import { App, ButtonComponent, Modal} from "obsidian";
import { IPublisher } from "./Publisher";
import { IPublishStatusManager } from "./PublishStatusManager";

export class PublishModal {
    modal: Modal;
    settings: DigitalGardenSettings;
    publishStatusManager: IPublishStatusManager;
    publisher: IPublisher;

    publishedContainer: HTMLElement;
    changedContainer: HTMLElement;
    deletedContainer: HTMLElement;
    unpublishedContainer: HTMLElement;

    progressContainer: HTMLElement;

    constructor(app: App, publishStatusManager: IPublishStatusManager, publisher: IPublisher, settings: DigitalGardenSettings) {
        this.modal = new Modal(app);
        this.settings = settings;
        this.publishStatusManager = publishStatusManager;
        this.publisher = publisher;

        this.initialize();
    }

    createCollapsable(title: string, buttonText: string, buttonCallback:()=>Promise<void>): HTMLElement {
        const headerContainer = this.modal.contentEl.createEl("div", {attr: {style: "display: flex; justify-content: space-between; margin-bottom: 10px; align-items:center"}});
        const toggleHeader = headerContainer.createEl("h3", { text: `➕️ ${title}`, attr: { class: "collapsable collapsed" } });
        if(buttonText && buttonCallback){

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

        this.progressContainer = this.modal.contentEl.createEl("div", { attr: {style: "height: 30px;" } });

        this.publishedContainer = this.createCollapsable("Published", null, null);
        this.changedContainer = this.createCollapsable("Changed", "Update changed files", async () => {
            const publishStatus = await this.publishStatusManager.getPublishStatus();
            const changed = publishStatus.changedNotes;
            let counter = 0;
            for(const note of changed){
                this.progressContainer.innerText = `⌛Publishing changed notes: ${++counter}/${changed.length}`;
                await this.publisher.publish(note);
            }

            const publishedText = `✅ Published all changed notes: ${counter}/${changed.length}`;
            this.progressContainer.innerText = publishedText;
            setTimeout(() => {
                if(this.progressContainer.innerText === publishedText){
                    this.progressContainer.innerText = "";
                }
            }, 5000)

            await this.refreshView();
        });

        this.deletedContainer = this.createCollapsable("Deleted from vault", "Delete notes from garden", async () => {
            const deletedNotes = await this.publishStatusManager.getDeletedNotePaths();
            let counter = 0; 
            for(const note of deletedNotes){
                this.progressContainer.innerText = `⌛Deleting Notes: ${++counter}/${deletedNotes.length}`;
                await this.publisher.delete(note);
            }

            const deleteDoneText = `✅ Deleted all notes: ${counter}/${deletedNotes.length}`;
            this.progressContainer.innerText = deleteDoneText;
            setTimeout(() => {
                if(this.progressContainer.innerText === deleteDoneText){
                    this.progressContainer.innerText = "";
                }
            }, 5000);

            await this.refreshView();

        });
        this.unpublishedContainer = this.createCollapsable("Unpublished", "Publish unpublished notes", async () => {
            const publishStatus = await this.publishStatusManager.getPublishStatus();
            const unpublished = publishStatus.unpublishedNotes;
            let counter = 0; 
            for(const note of unpublished){
                this.progressContainer.innerText = `⌛Publishing unpublished notes: ${++counter}/${unpublished.length}`;
                await this.publisher.publish(note);
            }
            const publishDoneText = `✅ Published all unpublished notes: ${counter}/${unpublished.length}`;
            this.progressContainer.innerText = publishDoneText;
            setTimeout(() => {
                if(this.progressContainer.innerText === publishDoneText){
                    this.progressContainer.innerText = "";
                }
            }, 5000)
            await this.refreshView();
        });


        this.modal.onOpen = () => this.refreshView();
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

    private async refreshView(){
        this.clearView();
        await this.populateWithNotes();
    }

    open() {
        this.modal.open();
    }
}
