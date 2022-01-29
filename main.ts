import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, getLinkpath } from 'obsidian';
import { clipboard } from 'electron';
import * as fs from "fs";
import * as path from 'path';
import { Octokit } from "@octokit/core";

// Remember to rename these classes and interfaces!

interface NotePublisherSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
}

const DEFAULT_SETTINGS: NotePublisherSettings = {
	githubRepo: '',
	githubToken: '',
	githubUserName:''
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
					// clipboard.writeText(`https://ole.dev/notes/${urlFileTitle}`);
					new Notice(`Successfully published note to your rock garden.`);

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
		const octokit = new Octokit({ auth: this.settings.githubToken });

		let base64Content = Buffer.from(content).toString('base64');
		const path = `src/site/notes/${title}`

		const payload = {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
			path,
			message: `Add note ${title}`,
			content: base64Content,
			sha: ''
		}; 
		
		let fileExists = true; 
		try {
			var response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				path
			});
		} catch (e) {
			fileExists = false;
			console.log("ERROR INCOMING");
			console.log(e)
		}



		if (fileExists && response.status === 200 && response.data.type === "file")
			payload.sha = response.data.sha;
			payload.message = `Update note ${title}`;

		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', payload);

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

	async createBase64Images(text: string): string {
		let imageText = text;
		let imageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
		let imageMatches = text.match(imageRegex);
		if (imageMatches) {
			for (let i = 0; i < imageMatches.length; i++) {
				let imageMatch = imageMatches[i];
				let imageName = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']'));
				let imagePath = getLinkpath(imageName);
				let linkedFile = this.app.metadataCache.getFirstLinkpathDest(imagePath, this.app.workspace.getActiveFile().path);
				let image = await this.app.vault.readBinary(linkedFile);
				let imageBase64 = arrayBufferToBase64(image)
				let imageMarkdown = `![${imageName}](data:image/png;base64,${imageBase64})`;
				imageText = imageText.replace(imageMatch, imageMarkdown);
			}
		}

		return imageText;
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
			.setName('Github repo')
			.setDesc('The name of the github repo')
			.addText(text => text
				.setPlaceholder('mydigitalgarden')
				.setValue(this.plugin.settings.githubRepo)
				.onChange(async (value) => {
					this.plugin.settings.githubRepo = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Github username')
			.setDesc('Your GitHub username')
			.addText(text => text
				.setPlaceholder('myusername')
				.setValue(this.plugin.settings.githubUserName)
				.onChange(async (value) => {
					this.plugin.settings.githubUserName= value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Github token')
			.setDesc('A github token')
			.addText(text => text
				.setPlaceholder('https://github.com/user/repo')
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
				}));



	}
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
	var binary = "";
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return window.btoa(binary);
}