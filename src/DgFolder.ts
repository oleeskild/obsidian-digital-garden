import {TFolder} from "obsidian";
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


export class DgFile extends DgAbstractFile {}


