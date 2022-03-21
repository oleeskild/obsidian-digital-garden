import { App, Notice, Plugin, PluginSettingTab, ButtonComponent, addIcon, Modal } from 'obsidian';
import Publisher from './Publisher';
import DigitalGardenSettings from 'DigitalGardenSettings';
import DigitalGardenSiteManager from 'DigitalGardenSiteManager';
import SettingView from 'SettingView';
import { PublishStatusBar } from 'PublishStatusBar';
import { seedling } from './constants';
import { PublishModal } from 'PublishModal';
import PublishStatusManager from 'PublishStatusManager';
import axios from "axios";

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: '',
	githubToken: '',
	githubUserName: '',
	gardenBaseUrl: '',
	prHistory: [],
	theme: "dark",
	baseTheme: '{"name": "default", "modes": ["dark"]}',
	faviconPath: ''
}

export default class DigitalGarden extends Plugin {
	settings: DigitalGardenSettings;
	appVersion: string;

	publishModal: PublishModal;

	async onload() {
		this.appVersion = "2.6.2";
		//If current appversion in settings unmatches this, show new notice with info about updating the template

		console.log("Initializing DigitalGarden plugin v" + this.appVersion);
		await this.loadSettings();

		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		await this.addCommands();


		addIcon('digital-garden-icon', seedling);
		this.addRibbonIcon("digital-garden-icon", "Digital Garden Publication Center", async () => {
			this.openPublishModal();
		});


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



