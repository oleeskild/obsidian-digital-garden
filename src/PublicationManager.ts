import { TFile, TFolder, Modal, ButtonComponent, Notice, TAbstractFile, App } from "obsidian";
import { DgFolder, DgFile, DgAbstractFile } from "./DgFolder";
import DigitalGardenSettings from "./DigitalGardenSettings";
import DigitalGardenSiteManager from "./DigitalGardenSiteManager";
import ObsidianFrontMatterEngine from "./ObsidianFrontMatterEngine";
import Publisher from "./Publisher";
import { PublishFileGroup, PublishStatus } from "./PublishStatus";
import PublishStatusManager from "./PublishStatusManager";

//For anyone finding themselves here: This code is horrible. But at least it is contained in this file...
export default class PublicationManager {
    app: App;
    settings: DigitalGardenSettings;
    constructor(app: App, settings: DigitalGardenSettings){
        this.app = app;
        this.settings = settings;
    }

filesMarkedForPublish:string[] = [];

	//[{files: TFile[], status:Enum}]
	generateFolderTree(files: PublishFileGroup[]): DgFolder{
		const folder =  this.app.vault.getRoot();

		var rootFolder=  DgFolder.fromTFolder(folder);

		for(const group of files){
			for (const path of group.files) {
				let currentFolder = rootFolder;
				let currentRootFolder = folder;
				const pathParts = path.split("/");
				let currentPath= "";
				for (const part of pathParts) {
					currentPath += "/" + part;
					const localFolder = currentFolder.children.find(x => x.name === part)
					const globalFolder = currentRootFolder.children.find(x => x.name === part);
					const folderAlreadyExists = !!localFolder;
					const folderIsDeleted = !globalFolder;
					if(folderIsDeleted && !folderAlreadyExists){
						if(part.endsWith(".md")){
							currentFolder.children.push(new DgFile(part, currentPath, group.status))
						}else{
							currentFolder.children.push(new DgFolder(part, currentPath))
						}
					}
					else if (!folderAlreadyExists && globalFolder instanceof TFile) {
						const originalFile = DgFile.fromTFile({...globalFolder});
						originalFile.parent = currentFolder;
						originalFile.publishStatus = group.status;
						currentFolder.children.push(originalFile);

					} else if (!folderAlreadyExists) {
						if (globalFolder instanceof TFolder) {
							const folder = DgFolder.fromTFolder(globalFolder);
							folder.parent = currentFolder;
							currentFolder.children.push(folder);
						}
					}

					//Folder exists, go to next;
					const nextLocalFolder = currentFolder.children.find(x => x.name === part)
					const nextGlobalFolder = currentRootFolder.children.find(x => x.name === part);
					if (nextLocalFolder instanceof DgFolder) {
						currentFolder = nextLocalFolder;
					}
					if (nextGlobalFolder instanceof TFolder) {
						currentRootFolder = nextGlobalFolder;
					}
				}
			}
		}

		return rootFolder;
	}

	//Activetab should be enum
	async expandFileSystemTree(modal:Modal, activeTab: string): Promise<void> {
		activeTab = activeTab||"changedFiles";

		modal.contentEl.innerHTML = "";
		modal.contentEl.style.display = "flex"
		modal.contentEl.style.flexDirection= "column";
		modal.contentEl.style.position= "relative";
		modal.contentEl.style.height= "500px";
		modal.contentEl.style.width= "1024px";
		modal.contentEl.style.overflow= "hidden";
		modal.open();
		modal.contentEl.createEl("div", {text: "Loading", attr: {id: 'loading', style: 'margin: auto; font-size: 32px;'}});

		const containerDiv = document.createElement("div"); 



		function activateTab() {
			if(this.parentElement.querySelector(".dg-active")) {
				this.parentElement.querySelector(".dg-active").classList.remove("dg-active");
			}
			this.classList.add("dg-active");
		}


		const publishedFiles = containerDiv.createEl('div', {text: "🟣 Published", cls: `dg-ready-to-publish-files dg-tab dg-tab-title ${activeTab === 'publishedFiles' ? 'dg-active' : ''}`}).createEl("div", {cls: "dg-tab-content"});
		publishedFiles.createEl("div", {text: "These are notes that have been published and are unchanged.", cls:"dg-explanation"});

		const changedFiles = containerDiv.createEl('div', {text: "🟡 Changed", cls: `dg-changed-files dg-tab dg-tab-title ${activeTab === 'changedFiles' ? 'dg-active' : ''}`}).createEl("div", {cls: "dg-tab-content"});
		changedFiles.createEl("div", {text: "These are notes that have been changed since the last publish.", cls:"dg-explanation"});

		const readyToPublishFiles = containerDiv.createEl('div', {text: "🟢 Ready to publish", cls: `dg-ready-to-publish-files dg-tab dg-tab-title ${activeTab === 'readyToPublishFiles' ? 'dg-active' : ''}`}).createEl("div", {cls: "dg-tab-content"});
		readyToPublishFiles.createEl("div", {text: "These are notes that are marked with dg-publish: true, but hasn't been published yet.", cls:"dg-explanation"});


		const unPublishedFiles = containerDiv.createEl('div', {text: "🔴 Unpublished", cls: `dg-unpublished-files dg-tab dg-tab-title ${activeTab === 'unPublishedFiles' ? 'dg-active' : ''}`})
			.createEl("div", {cls: "dg-tab-content"});
		unPublishedFiles.createEl("div", {text: "These are all notes that are not marked with dg-publish: true.", cls:"dg-explanation"});

		containerDiv.querySelectorAll(".dg-tab").forEach(x=>x.addEventListener('click', activateTab));
		
		const publishStatusManager = new PublishStatusManager(new DigitalGardenSiteManager(this.app.metadataCache, this.settings), new Publisher(this.app.vault, this.app.metadataCache, this.settings));	
		const status = await publishStatusManager.getPublishStatus();
		const changedNotes = this.generateFolderTree([{files: status.deletedNotePaths, status: PublishStatus.Deleted}, {files: status.changedNotes.map(x=>x.path), status: PublishStatus.Changed}]);
		const publishedNotes = this.generateFolderTree([{files: status.publishedNotes.map(x=>x.path), status: PublishStatus.Published}]);
		const readyToPublishNotes = this.generateFolderTree([{files: status.unpublishedNotes.map(x=>x.path), status: PublishStatus.ReadyToPublish}]);

		const publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);
		const unPublishedNoteFiles = await publisher.getFilesNotMarkedForPublishing();
		const unPublishedNotes = this.generateFolderTree([{files: unPublishedNoteFiles.map(x=>x.path), status: PublishStatus.Unpublished}]);

		this.expandChildren(changedNotes.children, changedFiles, false);
		this.expandChildren(readyToPublishNotes.children, readyToPublishFiles, false);
		this.expandChildren(publishedNotes.children, publishedFiles, false);
		this.expandChildren(unPublishedNotes.children, unPublishedFiles, false);
		
		//Remove flag an unpublish button for publishednotes
		//Button for removing publish

		const publishFileButtonContainer = publishedFiles.parentElement.createEl("div");
		const publishFileButton = new ButtonComponent(publishFileButtonContainer);
		publishFileButton 
		.setButtonText("Remove publish flag and unpublish")
		.onClick(async ()=>{
			let counter = 0;
			await publishedFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(async el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const engine = new ObsidianFrontMatterEngine(this.app.vault, this.app.metadataCache, file as TFile);
					const publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);
					await publisher.delete((file as TFile).path);
					await engine.remove("dg-publish").apply();
					counter++;
				}
			});
			new Notice(`Unpublished ${counter} files.`);
			this.expandFileSystemTree(modal, "publishedFiles");
		});
		
		//Add button for publishflag
		const buttonContainer = unPublishedFiles.parentElement.createEl("div");
		const button = new ButtonComponent(buttonContainer);
		button
		.setButtonText("Add publish flag")
		.onClick(()=>{
			let counter = 0;
			unPublishedFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const engine = new ObsidianFrontMatterEngine(this.app.vault, this.app.metadataCache, file as TFile);
					engine.set("dg-publish", true).apply();
					counter++;
				}
			});
			new Notice(`Added publish flag to ${counter} files.`);	
			this.expandFileSystemTree(modal, "readyToPublishFiles");
		});

		//Button for removing publish
		const removeFlagButtonContainer = readyToPublishFiles.parentElement.createEl("div");
		const removeFlagButton = new ButtonComponent(removeFlagButtonContainer );
		removeFlagButton 
		.setButtonText("Remove publish flag")
		.onClick(()=>{
			let counter = 0;
			readyToPublishFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const engine = new ObsidianFrontMatterEngine(this.app.vault, this.app.metadataCache, file as TFile);
					engine.remove("dg-publish").apply();
					counter++;
				}
			});
			new Notice(`Removed publish flag to ${counter} files.`);
			//Reload the publication center
			this.expandFileSystemTree(modal, "readyToPublishFiles");
		});

		//Button for removing publish
		const readyPublishFileButtonContainer = readyToPublishFiles.parentElement.createEl("div");
		const readyPublishFileButton = new ButtonComponent(readyPublishFileButtonContainer);
		readyPublishFileButton	
		.setButtonText("Publish")
		.onClick(()=>{
			let counter = 0;
			readyToPublishFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);
					publisher.publish(file as TFile);
					counter++;
				}
			});
			new Notice(`Published ${counter} files.`);
			this.expandFileSystemTree(modal, "readyToPublishFiles");
		});

		//Button for removing publish
		const changedFileButtonContainer = changedFiles.parentElement.createEl("div");
		const changedFileButton = new ButtonComponent(changedFileButtonContainer);
		changedFileButton  
		.setButtonText("Publish update")
		.onClick(()=>{
			let counter = 0;
			changedFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);
					if(!file){
						let filePath = htmlEl.dataset.filePath;
						if(htmlEl.dataset.filePath.startsWith("/")){
							filePath = htmlEl.dataset.filePath.substring(1);
						}
						publisher.delete(filePath);
					}else{
						publisher.publish(file as TFile);
					}
					counter++;
				}
			});
			new Notice(`Updated and published ${counter} files.`);
			//Reload the publication center
			this.expandFileSystemTree(modal, "changedFiles");
		});


		modal.contentEl.innerHTML = "";
		modal.contentEl.appendChild(containerDiv);

	}

	async expandChildren(children: DgAbstractFile[]|TAbstractFile[], container: HTMLElement, initial: boolean): Promise<void> {
		const ul = container.createEl("ul");
		ul.style.listStyle = "none";

		const expandButton = ul.parentElement.querySelector(".dg-expand") as HTMLElement;
		if (expandButton) {
			expandButton.addEventListener("click", function (e) {
				if (!initial) return;
				e.stopPropagation();
				if (ul.style.display === "none") {
					ul.show();
					expandButton.classList.remove("right");
					expandButton.classList.add("down");
				} else {
					expandButton.classList.remove("down");
					expandButton.classList.add("right");
					ul.hide();
				}
			});

		}
		if (initial) ul.hide();
		for (const child of children) {
			const isFolder = child instanceof DgFolder || child instanceof TFolder;
			let icon = isFolder ? "📁" : "📄";
			const li = ul.createEl("li");
			const status = child instanceof DgFile ? child.publishStatus : '' 
			const container = li.createEl("div",{cls:["dg-file-item", status]});

			if(isFolder){
				container.createEl("span", { text: " ", cls: "dg-expand dg-chevron right"});
			}else{
				container.createEl("span", { text: " ", cls: "dg-chevron-invisible", attr:{style: ""}});
			}

			const checkbox = container.createEl("input", { type: "checkbox", attr: { id: child.path }});
			checkbox.dataset.filePath = child.path;
			//checkbox.checked = this.filesMarkedForPublish.includes(child.path);
			

			container.createEl("label", { text: `${icon} ${child.name}`, attr: { for: child.path } });
			checkbox.addEventListener("change", function(){
				li.querySelectorAll("input[type=checkbox]").forEach(el=>{(el as HTMLInputElement).checked = this.checked});
			});
			if (child instanceof TFolder || child instanceof DgFolder) {
				if (child.children) {
					await this.expandChildren(child.children, li, true);
				}
			}

		}
	}

}