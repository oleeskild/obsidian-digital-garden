import { App, Notice, Plugin, PluginSettingTab, ButtonComponent } from 'obsidian';
import Publisher from './Publisher';
import DigitalGardenSettings from 'DigitalGardenSettings';
import DigitalGardenSiteManager from 'DigitalGardenSiteManager';
import SettingView from 'SettingView';

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: '',
	githubToken: '',
	githubUserName: '',
	gardenBaseUrl: '',
	prHistory: []
}

export default class DigitalGarden extends Plugin {
	settings: DigitalGardenSettings;
	appVersion: string;

	async onload() {
		this.appVersion = "2.1.2";

		console.log("Initializing DigitalGarden plugin v" + this.appVersion);
		await this.loadSettings();

		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		await this.addCommands();
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
					if(currentFile.extension !== 'md'){
						new Notice("The current file is not a markdown file. Please open a markdown file and try again.")
						return;
					}

					const publisher = new Publisher(vault, metadataCache, this.settings);
					const publishSuccessful = await publisher.publish(currentFile);

					if(publishSuccessful){
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
				try {
					const { vault, metadataCache } = this.app;
					const publisher = new Publisher(vault, metadataCache, this.settings);

					const filesToPublish = await publisher.getFilesMarkedForPublishing();

					let errorFiles = 0;
					for (const file of filesToPublish) {
						try {
							await publisher.publish(file);
						} catch {
							errorFiles++;
							new Notice(`Unable to publish note ${file.name}, skipping it.`)
						}
					}

					new Notice(`Successfully published ${filesToPublish.length - errorFiles} notes to your garden.`);

				} catch (e) {
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

	}


}

class DigitalGardenSettingTab extends PluginSettingTab {
	plugin: DigitalGarden;


	constructor(app: App, plugin: DigitalGarden) {
		super(app, plugin);
		this.plugin = plugin;
	}

	
	display(): void {
		const { containerEl } = this;
		const settingView = new SettingView(containerEl, this.plugin.settings, async ()=> await this.plugin.saveData(this.plugin.settings));


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
		settingView.renderCreatePr(handlePR);
		settingView.renderPullRequestHistory(this.plugin.settings.prHistory.slice(0,10));
	}
}



