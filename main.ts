import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { clipboard } from 'electron';

// Remember to rename these classes and interfaces!

interface NotePublisherSettings {
	uploadFunctionUrl: string;
	buildWebHook: string;
}

const DEFAULT_SETTINGS: NotePublisherSettings = {
	uploadFunctionUrl: 'default',
	buildWebHook: 'default'

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
				let text = editor.getValue();
				await this.uploadText(view.file.name, text);
				let fileTitle = view.file.name.replace(".md", "");
				// new PublishedModal(this.app, `https://ole.dev/notes/${fileTitle}`).open();
				clipboard.writeText(`https://ole.dev/notes/${fileTitle}`);
				new Notice(`Successfully published to https://ole.dev/notes/${fileTitle}.` + 
				` Link was added to clipboard.`);

				await this.triggerBuild();
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
		await fetch(this.settings.buildWebHook);
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
			.setDesc('The URL to GET to trigger a build')
			.addText(text => text
				.setPlaceholder('https://netlify.com/webhook/123')
				.setValue(this.plugin.settings.buildWebHook)
				.onChange(async (value) => {
					this.plugin.settings.buildWebHook = value;
					await this.plugin.saveSettings();
				}));

	}
}
