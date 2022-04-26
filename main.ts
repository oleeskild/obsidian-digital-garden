import { App, Notice, Plugin, PluginSettingTab, ButtonComponent, addIcon, Modal, TFolder, TFile, TAbstractFile } from 'obsidian';
import Publisher from 'src/Publisher';
import DigitalGardenSettings from 'src/DigitalGardenSettings';
import DigitalGardenSiteManager from 'src/DigitalGardenSiteManager';
import SettingView from 'src/SettingView';
import { PublishStatusBar } from 'src/PublishStatusBar';
import { seedling } from 'src/constants';
import { PublishModal } from 'src/PublishModal';
import PublishStatusManager from 'src/PublishStatusManager';
import ObsidianFrontMatterEngine from 'src/ObsidianFrontMatterEngine';

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: '',
	githubToken: '',
	githubUserName: '',
	gardenBaseUrl: '',
	prHistory: [],
	theme: "dark",
	baseTheme: '{"name": "default", "modes": ["dark"]}',
	faviconPath: '',
	showRibbonIcon: true,
	defaultNoteSettings: {
		dgHomeLink: true,
		dgPassFrontmatter: false,
	}
}

export default class DigitalGarden extends Plugin {
	settings: DigitalGardenSettings;
	appVersion: string;

	publishModal: PublishModal;

	async onload() {
		this.appVersion =  this.manifest.version;

		console.log("Initializing DigitalGarden plugin v" + this.appVersion);
		await this.loadSettings();

		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		await this.addCommands();

		addIcon('digital-garden-icon', seedling);
		if(this.settings.showRibbonIcon){
			this.addRibbonIcon("digital-garden-icon", "Digital Garden Publication Center", async () => {
				this.openPublishModal();
			});
		}

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async addCommands() {
		this.addCommand({
			id: 'publish-note',
			name: 'Publish Single Note',
			callback: async () => {
				try {
					const { vault, workspace, metadataCache } = this.app;

					const currentFile = workspace.getActiveFile();
					if (!currentFile) {
						new Notice("No file is open/active. Please open a file and try again.")
						return;
					}
					if (currentFile.extension !== 'md') {
						new Notice("The current file is not a markdown file. Please open a markdown file and try again.")
						return;
					}

					new Notice("Publishing note...");
					const publisher = new Publisher(vault, metadataCache, this.settings);
					const publishSuccessful = await publisher.publish(currentFile);

					if (publishSuccessful) {
						new Notice(`Successfully published note to your garden.`);
					}

				} catch (e) {
					console.error(e)
					new Notice("Unable to publish note, something went wrong.")
				}
			},
		});

		this.addCommand({
			id: 'publish-multiple-notes',
			name: 'Publish Multiple Notes',
			callback: async () => {
				const statusBarItem = this.addStatusBarItem();
				try {
					const { vault, metadataCache } = this.app;
					const publisher = new Publisher(vault, metadataCache, this.settings);
					const siteManager = new DigitalGardenSiteManager(metadataCache, this.settings);
					const publishStatusManager = new PublishStatusManager(siteManager, publisher);

					const publishStatus = await publishStatusManager.getPublishStatus();
					const filesToPublish = publishStatus.changedNotes.concat(publishStatus.unpublishedNotes)
					const filesToDelete = publishStatus.deletedNotePaths;
					const statusBar = new PublishStatusBar(statusBarItem, filesToPublish.length + filesToDelete.length);

					let errorFiles = 0;
					let errorDeleteFiles = 0;
					for (const file of filesToPublish) {
						try {
							statusBar.increment();
							await publisher.publish(file);
						} catch {
							errorFiles++;
							new Notice(`Unable to publish note ${file.name}, skipping it.`)
						}
					}

					for (const filePath of filesToDelete) {
						try {
							statusBar.increment();
							await publisher.delete(filePath);
						} catch {
							errorDeleteFiles++;
							new Notice(`Unable to delete note ${filePath}, skipping it.`)
						}
					}

					statusBar.finish(8000);
					new Notice(`Successfully published ${filesToPublish.length - errorFiles} notes to your garden.`);
					if (filesToDelete.length > 0) {
						new Notice(`Successfully deleted ${filesToDelete.length - errorDeleteFiles} notes from your garden.`);
					}

				} catch (e) {
					statusBarItem.remove();
					console.error(e)
					new Notice("Unable to publish multiple notes, something went wrong.")
				}
			},
		});

		this.addCommand({
			id: 'copy-garden-url',
			name: 'Copy Garden URL',
			callback: async () => {
				try {
					const { metadataCache, workspace } = this.app;
					const currentFile = workspace.getActiveFile();
					if (!currentFile) {
						new Notice("No file is open/active. Please open a file and try again.")
						return;
					}

					const siteManager = new DigitalGardenSiteManager(metadataCache, this.settings);
					const fullUrl = siteManager.getNoteUrl(currentFile);

					await navigator.clipboard.writeText(fullUrl);
					new Notice(`Note URL copied to clipboard`);
				} catch (e) {
					console.log(e)
					new Notice("Unable to copy note URL to clipboard, something went wrong.")
				}
			}
		});

		this.addCommand({
			id: 'dg-open-publish-modal',
			name: 'Open Publication Center',
			callback: async () => {
				this.openPublishModal();
			}
		});

		this.addCommand({
			id: 'dg-mark-note-for-publish',
			name: 'Add publish flag',
			callback: async () => {
				const engine = new ObsidianFrontMatterEngine(this.app.vault, this.app.metadataCache, this.app.workspace.getActiveFile());
				engine.set("dg-publish", true).apply();
			}
		});

		this.addCommand({
			id: 'testing',
			name: 'Open filetree',
			callback: async () => {
				await this.expandFileSystemTree();
			}
		});



	}

	filesMarkedForPublish:string[] = [];

	async expandFileSystemTree(): Promise<void> {
		const folder = await this.app.vault.getRoot();
		const modal = new Modal(this.app);
		modal.contentEl.style.display = "flex"
		modal.contentEl.style.flexDirection= "row";
		modal.contentEl.style.position= "relative";
		modal.contentEl.style.height= "500px";
		modal.contentEl.style.width= "600px";
		modal.contentEl.style.overflowY= "hidden";


		function activateTab() {
			if(this.parentElement.querySelector(".dg-active")) {
				this.parentElement.querySelector(".dg-active").classList.remove("dg-active");
			}
			this.classList.add("dg-active");
		}

		const changedFiles = modal.contentEl.createEl('div', {text: "🟡 Changed", cls: "dg-changed-files dg-tab dg-active"}).createEl("div", {cls: "dg-tab-content"});

		const readyToPublishFiles = modal.contentEl.createEl('div', {text: "🟢 Ready to publish", cls: "dg-ready-to-publish-files dg-tab"}).createEl("div", {cls: "dg-tab-content"});

		const publishedFiles = modal.contentEl.createEl('div', {text: "🟣 Published", cls: "dg-ready-to-publish-files dg-tab"}).createEl("div", {cls: "dg-tab-content"});

		const unPublishedFiles = modal.contentEl.createEl('div', {text: "🔴 Unpublished", cls: "dg-unpublished-files dg-tab"}).createEl("div", {cls: "dg-tab-content"});

		modal.contentEl.querySelectorAll(".dg-tab").forEach(x=>x.addEventListener('click', activateTab));
		
		this.filesMarkedForPublish = (await new Publisher(this.app.vault, this.app.metadataCache, this.settings).getFilesMarkedForPublishing()).map(x=>x.path);

		this.expandChildren(folder.children, changedFiles, false);
		this.expandChildren(folder.children, readyToPublishFiles, false);
		this.expandChildren(folder.children, publishedFiles, false);
		this.expandChildren(folder.children, unPublishedFiles, false);
		
		const buttonContainer = modal.modalEl.createEl("div");
		const button = new ButtonComponent(buttonContainer);
		button
		.setButtonText("Add publish flag")
		.onClick(()=>{
			let counter = 0;
			changedFiles.querySelectorAll("input[type=checkbox][data-file-path]").forEach(el=>{
				const htmlEl = el as HTMLInputElement; 
				if(htmlEl.checked && htmlEl.dataset.filePath.endsWith(".md")){
					console.log(htmlEl.dataset.filePath);
					const file = this.app.vault.getAbstractFileByPath(htmlEl.dataset.filePath);
					const engine = new ObsidianFrontMatterEngine(this.app.vault, this.app.metadataCache, file as TFile);
					engine.set("dg-publish", true).apply();
					counter++;
				}
			});
			new Notice(`Added publish flag to ${counter} files.`);
		});
		modal.open();

	}

	async expandChildren(children: TAbstractFile[], container: HTMLElement, initial: boolean): Promise<void> {
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
			const isFolder = child instanceof TFolder ;
			let icon = isFolder ? "📁" : "📄";
			const li = ul.createEl("li");
			const container = li.createEl("div");

			if(isFolder){
				container.createEl("span", { text: " ", cls: "dg-expand dg-chevron right"});
			}else{
				container.createEl("span", { text: " ", cls: "dg-chevron-invisible", attr:{style: ""}});
			}

			const checkbox = container.createEl("input", { type: "checkbox", attr: { id: child.path }});
			checkbox.dataset.filePath = child.path;
			checkbox.checked = this.filesMarkedForPublish.includes(child.path);
			

			container.createEl("label", { text: `${icon} ${child.name}`, attr: { for: child.path } });
			checkbox.addEventListener("change", function(){
				li.querySelectorAll("input[type=checkbox]").forEach(el=>{(el as HTMLInputElement).checked = this.checked});
			});
			if (child instanceof TFolder) {
				if (child.children) {
					await this.expandChildren(child.children, li, true);
				}
			}

		}
	}

	openPublishModal() {
		if (!this.publishModal) {
			const siteManager = new DigitalGardenSiteManager(this.app.metadataCache, this.settings);
			const publisher = new Publisher(this.app.vault, this.app.metadataCache, this.settings);
			const publishStatusManager = new PublishStatusManager(siteManager, publisher);
			this.publishModal = new PublishModal(this.app, publishStatusManager, publisher, this.settings);
		}
		this.publishModal.open();
	}

}

class DigitalGardenSettingTab extends PluginSettingTab {
	plugin: DigitalGarden;


	constructor(app: App, plugin: DigitalGarden) {
		super(app, plugin);
		this.plugin = plugin;
	}


	async display(): Promise<void> {
		const { containerEl } = this;
		const settingView = new SettingView(this.app, containerEl, this.plugin.settings, async () => await this.plugin.saveData(this.plugin.settings));
		const prModal = new Modal(this.app)
		await settingView.initialize(prModal);


		const handlePR = async (button: ButtonComponent) => {
			settingView.renderLoading();
			button.setDisabled(true);

			try {
				const siteManager = new DigitalGardenSiteManager(this.plugin.app.metadataCache, this.plugin.settings);

				const prUrl = await siteManager.createPullRequestWithSiteChanges()

				if (prUrl) {
					this.plugin.settings.prHistory.push(prUrl);
					await this.plugin.saveSettings();
				}
				settingView.renderSuccess(prUrl);
				button.setDisabled(false);

			} catch {
				settingView.renderError();
			}


		};
		settingView.renderCreatePr(prModal, handlePR);
		settingView.renderPullRequestHistory(prModal, this.plugin.settings.prHistory.reverse().slice(0, 10));
	}
}



