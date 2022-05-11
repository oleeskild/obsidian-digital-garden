import {TFile, TFolder} from "obsidian";
import { PublishStatus } from "./PublishStatus";
export abstract class DgAbstractFile{
	name: string;
	path: string;
	parent: any;
}

export class DgFolder extends DgAbstractFile {
	children: DgAbstractFile[];
	constructor(folder: TFolder){
		super();
		this.name = folder.name;
		this.path = folder.path;
		this.children = [];
	}
}


export class DgFile extends DgAbstractFile {
	publishStatus: PublishStatus;
	constructor(file: TFile){
		super();
		this.name = file.name;
		this.path = file.path;
		this.publishStatus = PublishStatus.Undefined;
	}
}


