import {TFile} from "obsidian";
export enum PublishStatus{
    Changed="Changed",
    Deleted="Deleted",
    Published="Published",
    ReadyToPublish="ReadyToPublish",
    Unpublished="Unpublished",
    Undefined="Undefined"
}

export interface PublishFileGroup{
    files: string[];//filepath
    status: PublishStatus;
}
