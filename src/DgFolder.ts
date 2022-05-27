import {TFile, TFolder} from "obsidian";
import { PublishStatus } from "./PublishStatus";
export abstract class DgAbstractFile{
	name: string;
	path: string;
	parent: any;
}

export class DgFolder extends DgAbstractFile {
	children: DgAbstractFile[];

	constructor(name: string, path: string){
		super();
		this.name = name;
		this.path = path;
		this.children = [];
	}
	
	static fromTFolder(folder: TFolder){
		return new DgFolder(folder.name, folder.path);
	}
}


export class DgFile extends DgAbstractFile {
	publishStatus: PublishStatus;
	constructor(name: string, path: string, publishStatus: PublishStatus = PublishStatus.Undefined){
		super();
		this.name = name;
		this.path = path;
		this.publishStatus = publishStatus;
	}

	static fromTFile(file: TFile){
		return new DgFile(file.name, file.path);
	}
}


