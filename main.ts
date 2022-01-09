import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { clipboard } from 'electron';
import * as fs from "fs";
import * as path from 'path';

// Remember to rename these classes and interfaces!

interface NotePublisherSettings {
	uploadFunctionUrl: string;
	buildWebHook: string;
	attachmentFolder: string;
}

const DEFAULT_SETTINGS: NotePublisherSettings = {
	uploadFunctionUrl: 'default',
	buildWebHook: 'default',
	attachmentFolder: 'attachments'
}

export default class NotePublisher extends Plugin {
	settings: NotePublisherSettings;

	async onload() {
		await this.loadSettings();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'publish-note',
			name: 'Publish Note',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {


					let text = editor.getValue();
					text = await this.createBase64Images(text);

					await this.uploadText(view.file.name, text);
					let fileTitle = view.file.name.replace(".md", "");
					let urlFileTitle = encodeURI(fileTitle);
					// new PublishedModal(this.app, `https://ole.dev/notes/${fileTitle}`).open();
					clipboard.writeText(`https://ole.dev/notes/${urlFileTitle}`);
					new Notice(`Successfully published to https://ole.dev/notes/${urlFileTitle}.` +
						` Link was added to clipboard.`);

					await this.triggerBuild();
				} catch (e) {
					console.error(e)
					new Notice("Unable to publish note, something went wrong.")
				}
			},

		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new NotePubliserSettingTab(this.app, this));

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	async uploadText(title: string, content: string) {
		await fetch(this.settings.uploadFunctionUrl, {
			method: 'POST',
			body: JSON.stringify({
				title,
				content
			}),
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}

	async triggerBuild() {
		await fetch(this.settings.buildWebHook, {
			method: 'POST'
		});
	}

	async getImage(filePath: string) {
		return new Promise((resolve, reject) => {
			fs.readFile(filePath, (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}

	async createBase64Images(text: string):string {
		let imageText = text;
		let imageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
		let imageMatches = text.match(imageRegex);
		if (imageMatches) {
			for (let i = 0; i < imageMatches.length; i++) {
				let imageMatch = imageMatches[i];
				let imageName = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']'));
				let imagePath = path.join(this.settings.attachmentFolder, imageName);
				let absolutePath = path.join(this.app.vault.adapter.basePath, imagePath);
				let image = await this.getImage(absolutePath);
				let imageBase64 = image.toString('base64');
				let imageMarkdown = `![${imageName}](data:image/png;base64,${imageBase64})`;
				imageText = imageText.replace(imageMatch, imageMarkdown);
			}
		}

		return imageText;
	}
}


class PublishedModal extends Modal {
	url = "";
	constructor(app: App, url: string = "") {
		super(app);
		this.url = url;
	}

	onOpen() {
		const { contentEl } = this;
		let link = document
			.createElement("a");
		link.setAttribute("href", this.url)
		link.setAttribute("target", "_blank")
		link.innerText = this.url;
		contentEl.appendChild(link)
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NotePubliserSettingTab extends PluginSettingTab {
	plugin: NotePublisher;

	constructor(app: App, plugin: NotePublisher) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings ' });

		new Setting(containerEl)
			.setName('URL of upload function')
			.setDesc('')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.uploadFunctionUrl)
				.onChange(async (value) => {
					this.plugin.settings.uploadFunctionUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Build Web Hook')
			.setDesc('The URL to trigger a build (Using a POST request)')
			.addText(text => text
				.setPlaceholder('https://netlify.com/webhook/123')
				.setValue(this.plugin.settings.buildWebHook)
				.onChange(async (value) => {
					this.plugin.settings.buildWebHook = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Attachments folder')
			.setDesc('The folder where attachments are stored')
			.addText(text => text
				.setPlaceholder('attachments')
				.setValue(this.plugin.settings.attachmentFolder)
				.onChange(async (value) => {
					this.plugin.settings.attachmentFolder= value;
					await this.plugin.saveSettings();
				}));


	}
}
