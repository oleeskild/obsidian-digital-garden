import DigitalGardenSettings from "DigitalGardenSettings";
import { IDigitalGardenSiteManager } from "DigitalGardenSiteManager";
import { App, Modal, TFile } from "obsidian";
import { IPublisher } from "Publisher";
import { generateBlobHash } from "utils";

export class PublishModal {
    modal: Modal;
    siteManager: IDigitalGardenSiteManager;
    settings: DigitalGardenSettings;
    publisher: IPublisher;

    publishedContainer: HTMLElement;
    changedContainer: HTMLElement;
    deletedContainer: HTMLElement;
    unpublishedContainer: HTMLElement;

    constructor(app: App, siteManager: IDigitalGardenSiteManager, publisher: IPublisher, 
        settings: DigitalGardenSettings) {
        this.modal = new Modal(app)
        this.siteManager = siteManager;
        this.settings = settings;
        this.publisher = publisher;

        this.initialize();
    }

    createCollapsable(title:string): HTMLElement{
        const toggleHeader = this.modal.contentEl.createEl("h3", { text: `➡️️ ${title}`, attr:{class:"collapsable collapsed"} });
        const toggledList = this.modal.contentEl.createEl("ul");
        toggledList.hide();

        toggleHeader.onClickEvent(() => {
            if(toggledList.isShown()){
                toggleHeader.textContent = `➡️️ ${title}`;
                toggledList.hide();
                toggleHeader.removeClass("open");
                toggleHeader.addClass("collapsed");
            }else{
                toggleHeader.textContent = `⬇️ ${title}`;
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
        this.changedContainer= this.createCollapsable("Changed");
        this.deletedContainer = this.createCollapsable("Deleted from vault");
        this.unpublishedContainer = this.createCollapsable("Unpublished");
        
        this.modal.onOpen = ()=>this.populateWithNotes();
        this.modal.onClose = ()=>this.clearView();
    }

    async clearView(){
        this.publishedContainer.childNodes.forEach(node=>node.remove());
        this.changedContainer.childNodes.forEach(node=>node.remove());
        this.deletedContainer.childNodes.forEach(node=>node.remove());
        this.unpublishedContainer.childNodes.forEach(node=>node.remove());
    }
    async populateWithNotes(){
        const publishStatus = await this.buildPublishStatus();
        publishStatus.publishedNotes.map(file=>this.publishedContainer.createEl("li", { text: file.path}));
        publishStatus.unpublishedNotes.map(file=>this.unpublishedContainer.createEl("li", { text: file.path}));
        publishStatus.changedNotes.map(file=>this.changedContainer.createEl("li", { text: file.path}));
        publishStatus.deletedNotePaths.map(path=>this.deletedContainer.createEl("li", { text: path}));
    }

    async buildPublishStatus(){
        const unpublishedNotes: Array<TFile> = [];
        const publishedNotes: Array<TFile> = [];
        const changedNotes: Array<TFile> = [];

        const deletedNotePaths: Array<string> = [];

        const remoteNoteHashes = await this.siteManager.getNoteHashes();
        const marked = await this.publisher.getFilesMarkedForPublishing();

        for (const file of marked) {
            const content = await this.publisher.generateMarkdown(file);

            const localHash = generateBlobHash(content);
            const remoteHash = remoteNoteHashes[file.path];
            if(!remoteHash) {
                unpublishedNotes.push(file);
            }
            else if(remoteHash === localHash) {
                publishedNotes.push(file);
            }
            else{
                changedNotes.push(file);
            }
        }

        Object.keys(remoteNoteHashes).forEach(key => {
            if(!marked.find(f => f.path === key)) {
                deletedNotePaths.push(key);
            }
        });

        return {unpublishedNotes, publishedNotes, changedNotes, deletedNotePaths};
    }

    open() {
        this.modal.open();
    }
}