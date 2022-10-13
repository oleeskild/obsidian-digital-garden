import { IDigitalGardenSiteManager } from "./DigitalGardenSiteManager";
import { TFile } from "obsidian";
import { IPublisher } from "./Publisher";
import { generateBlobHash } from "./utils";

export default class PublishStatusManager implements IPublishStatusManager{
    siteManager: IDigitalGardenSiteManager;
    publisher: IPublisher;
    constructor(siteManager: IDigitalGardenSiteManager, publisher:IPublisher ){
       this.siteManager = siteManager;
       this.publisher = publisher;
    }

    async getDeletedNotePaths(): Promise<Array<string>> {
        
        const remoteNoteHashes = await this.siteManager.getNoteHashes();
        const marked = await this.publisher.getFilesMarkedForPublishing();
        return this.generateDeletedNotePaths(remoteNoteHashes, marked);
    }

    private generateDeletedNotePaths(remoteNoteHashes: {[key:string]: string}, marked: TFile[]): Array<string> {
        const deletedNotePaths: Array<string> = [];
        Object.keys(remoteNoteHashes).forEach(key => {
            if (!marked.find(f => f.path === key)) {
                if(!key.endsWith(".js")){
                    deletedNotePaths.push(key);
                }
            }
        });

        return deletedNotePaths;
    }
    async getPublishStatus(): Promise<PublishStatus> {
        const unpublishedNotes: Array<TFile> = [];
        const publishedNotes: Array<TFile> = [];
        const changedNotes: Array<TFile> = [];


        const remoteNoteHashes = await this.siteManager.getNoteHashes();
        const marked = await this.publisher.getFilesMarkedForPublishing();

        for (const file of marked) {
            const content = await this.publisher.generateMarkdown(file);

            const localHash = generateBlobHash(content);
            const remoteHash = remoteNoteHashes[file.path];
            if (!remoteHash) {
                unpublishedNotes.push(file);
            }
            else if (remoteHash === localHash) {
                publishedNotes.push(file);
            }
            else {
                changedNotes.push(file);
            }
        }

        const deletedNotePaths = this.generateDeletedNotePaths(remoteNoteHashes, marked);

        unpublishedNotes.sort((a, b) => a.path > b.path ? 1 : -1);
        publishedNotes.sort((a, b) => a.path > b.path ? 1 : -1);
        changedNotes.sort((a, b) => a.path > b.path ? 1 : -1);
        deletedNotePaths.sort((a, b) => a > b ? 1 : -1);
        return { unpublishedNotes, publishedNotes, changedNotes, deletedNotePaths };
    }
}

export interface PublishStatus{
    unpublishedNotes: Array<TFile>;
    publishedNotes: Array<TFile>;
    changedNotes: Array<TFile>;
    deletedNotePaths: Array<string>;
}

export interface IPublishStatusManager{
    getPublishStatus(): Promise<PublishStatus>; 
    getDeletedNotePaths(): Promise<Array<string>>;
}