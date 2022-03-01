import { App, Notice, Plugin, PluginSettingTab, Setting, getLinkpath, Editor, MarkdownView } from 'obsidian';
import { Octokit } from "@octokit/core";
import { Base64 } from "js-base64";
import fm from 'front-matter';
import slugify from '@sindresorhus/slugify';
import { link } from 'fs';

interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	gardenBaseUrl: string;
	prHistory: string[];
}

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: '',
	githubToken: '',
	githubUserName: '',
	gardenBaseUrl: '',
	prHistory: []
}

export default class DigitalGarden extends Plugin {
	settings: DigitalGardenSettings;
	version: string;
	branchName: string;

	async onload() {
		this.version = "1.3.0";

		this.branchName = "update-template-to-v" + this.version;
		await this.loadSettings();

		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		await this.addCommands();

	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async addCommands() {
		this.addCommand({
			id: 'publish-note',
			name: 'Publish Note',
			callback: async () => {
				try {
					const { vault, workspace } = this.app;
					const currentFile = workspace.getActiveFile();
					if (!currentFile) {
						new Notice("No file is open/active. Please open a file and try again.")
						return;
					}
					let text = await vault.cachedRead(currentFile);
					text = await this.createTranscludedText(text, currentFile.path);
					text = await this.createBase64Images(text, currentFile.path);

					await this.uploadText(currentFile.name, text);
					new Notice(`Successfully published note to your garden.`);
				} catch (e) {
					console.error(e)
					new Notice("Unable to publish note, something went wrong.")
				}
			},
		});

		this.addCommand({
			id: 'copy-note-url',
			name: 'Copy Note URL',
			callback: async () => {
				try {
					const { vault, workspace } = this.app;
					const currentFile = workspace.getActiveFile();
					if (!currentFile) {
						new Notice("No file is open/active. Please open a file and try again.")
						return;
					}

					const baseUrl = this.settings.gardenBaseUrl ?
						`https://${extractBaseUrl(this.settings.gardenBaseUrl)}`
						: `https://${this.settings.githubRepo}.netlify.app`;

					let urlPath = `/notes/${slugify(currentFile.basename)}`;
					const content = await vault.cachedRead(currentFile);
					const fmData = fm(content);
					if (fmData.attributes.permalink) {
						urlPath = `/${fmData.attributes.permalink}`;
					}

					const fullUrl = `${baseUrl}${urlPath}`;
					await navigator.clipboard.writeText(fullUrl);
					new Notice(`Copied note URL to clipboard: ${fullUrl}`);
				} catch (e) {
					new Notice("Unable to copy note URL to clipboard, something went wrong.")
				}
			}
		});

	}

	async uploadText(title: string, content: string) {
		if (!this.settings.githubRepo) {
			new Notice("Config error: You need to define a GitHub repo in the plugin settings");
			throw {};
		}
		if (!this.settings.githubUserName) {
			new Notice("Config error: You need to define a GitHub Username in the plugin settings");
			throw {};
		}
		if (!this.settings.githubToken) {
			new Notice("Config error: You need to define a GitHub Token in the plugin settings");
			throw {};
		}


		const octokit = new Octokit({ auth: this.settings.githubToken });


		const base64Content = Base64.encode(content);
		const path = `src/site/notes/${title}`

		const payload = {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
			path,
			message: `Add note ${title}`,
			content: base64Content,
			sha: ''
		};

		try {
			const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				path
			});
			if (response.status === 200 && response.data.type === "file") {
				payload.sha = response.data.sha;
			}
		} catch (e) {
			console.log(e)
		}


		payload.message = `Update note ${title}`;

		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', payload);

	}

	async createTranscludedText(text: string, filePath: string): Promise<string> {
		let transcludedText = text;
		const transcludedRegex = /!\[\[(.*?)\]\]/g;
		const transclusionMatches = text.match(transcludedRegex);
		if (transclusionMatches) {
			for (let i = 0; i < transclusionMatches.length; i++) {
				try {
					const transclusionMatch = transclusionMatches[i];
					const tranclusionFileName = transclusionMatch.substring(transclusionMatch.indexOf('[') + 2, transclusionMatch.indexOf(']'));
					const tranclusionFilePath = getLinkpath(tranclusionFileName);
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(tranclusionFilePath, filePath);
					if (["md", "txt"].indexOf(linkedFile.extension) == -1) {
						continue;
					}
					let fileText = await this.app.vault.cachedRead(linkedFile);
					fileText = "\n```transclusion\n# " + tranclusionFileName + "\n\n" + fileText + '\n```\n'
					//This should be recursive up to a certain depth
					transcludedText = transcludedText.replace(transclusionMatch, fileText);
				} catch {
					continue;
				}
			}
		}

		return transcludedText;

	}

	async createBase64Images(text: string, filePath: string): Promise<string> {
		let imageText = text;
		const imageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
		const imageMatches = text.match(imageRegex);
		if (imageMatches) {
			for (let i = 0; i < imageMatches.length; i++) {

				try {
					const imageMatch = imageMatches[i];
					const imageName = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']'));
					const imagePath = getLinkpath(imageName);
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(imagePath, filePath);
					const image = await this.app.vault.readBinary(linkedFile);
					const imageBase64 = arrayBufferToBase64(image)
					const imageMarkdown = `![${imageName}](data:image/${linkedFile.extension};base64,${imageBase64})`;
					imageText = imageText.replace(imageMatch, imageMarkdown);
				} catch {
					continue;
				}

			}
		}

		return imageText;
	}

	async updateTemplateFiles() {

		//This can also be used to update settings via an .ENV file for things like "Include versionednotes"

		let files = [
			".eleventy.js", "README.md", "netlify.toml", "package-lock.json", "package.json",
			"src/site/404.njk",
			"src/site/index.njk",
			"src/site/versionednote.njk",
			"src/site/versionednote.njk",
			"src/site/styles/style.css",
			"src/site/notes/notes.json",
			"src/site/_includes/layouts/note.njk",
			"src/site/_includes/layouts/versionednote.njk",
			"src/site/_includes/components/notegrowthhistory.njk",
			"src/site/_includes/components/pageheader.njk",
			"src/site/_data/versionednotes.js",
		];

		const octokit = new Octokit({ auth: this.settings.githubToken });
		const latestCommit = await octokit.request('GET /repos/{owner}/{repo}/commits/main', {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
		});

		//create new branch
		try {


			const branch = await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				ref: `refs/heads/${this.branchName}`,
				sha: latestCommit.data.sha
			});
		} catch (e) {
			//Ignore if the branch already exists
		}

		for (let file of files) {
			//get from my repo
			const latestFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: "oleeskild",
				repo: "digitalgarden",
				path: file
			});

			const currentFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				path: file,
				ref: this.branchName
			});

			if (latestFile.data.sha !== currentFile.data.sha) {
				//commit
				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
					path: file,
					branch: this.branchName,
					message: "Update template file",
					content: latestFile.data.content,
					sha: currentFile.data.sha
				});
			}
		}

		//create pull request
		const pr = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
			owner: this.settings.githubUserName,
			repo: this.settings.githubRepo,
			title: `Update template to version ${this.version}`,
			head: this.branchName,
			base: "main",
			body: "Update to latest template version"
		});

		return pr.data.html_url;
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
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Settings ' });
		containerEl.createEl('span', { text: 'Remember to read the setup guide if you haven\'t already. It can be found ' });
		containerEl.createEl('a', { text: 'here.', href: "https://github.com/oleeskild/Obsidian-Digital-Garden" });

		new Setting(containerEl)
			.setName('GitHub repo name')
			.setDesc('The name of the GitHub repository')
			.addText(text => text
				.setPlaceholder('mydigitalgarden')
				.setValue(this.plugin.settings.githubRepo)
				.onChange(async (value) => {
					this.plugin.settings.githubRepo = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('GitHub Username')
			.setDesc('Your GitHub Username')
			.addText(text => text
				.setPlaceholder('myusername')
				.setValue(this.plugin.settings.githubUserName)
				.onChange(async (value) => {
					this.plugin.settings.githubUserName = value;
					await this.plugin.saveSettings();
				}));

		const desc = document.createDocumentFragment();
		desc.createEl("span", null, (span) => {
			span.innerText =
				"A GitHub token with repo permissions. You can generate it ";
			span.createEl("a", null, (link) => {
				link.href = "https://github.com/settings/tokens/new?scopes=repo";
				link.innerText = "here!";
			});
		});

		new Setting(containerEl)
			.setName('GitHub token')
			.setDesc(desc)
			.addText(text => text
				.setPlaceholder('https://github.com/user/repo')
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc(`
				This is used for the "Copy Note URL" command and is optional. 
				If you leave it blank, the plugin will try to guess it from the repo name.
			`)
			.addText(text => text
				.setPlaceholder('my-digital-garden.netlify.app')
				.setValue(this.plugin.settings.gardenBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.gardenBaseUrl = value;
					await this.plugin.saveSettings();
				}));

		let previousPrs: any = null;


		new Setting(containerEl)
			.setName('Update to latest template')
			.setDesc(`
				This will create a pull request with the latest template changes. 
				It will not publish any changes before you approve them.
				You can even test the changes first Netlify will automatically provide you with a test URL.
			`)
			.addButton(button => button
				.setButtonText('Create PR')
				.onClick(async () => {
					let msg: HTMLParagraphElement = null;
					let loading: HTMLParagraphElement = null;
					if (previousPrs) {
						msg = document.createDocumentFragment().createEl('p', { text: 'Creating PR. This should take less than 1 minute...' });
						loading = document.createDocumentFragment().createEl('p', { text: 'Loading' });
						previousPrs.prepend(loading);
						previousPrs.prepend(msg);
					} else {
						msg = this.containerEl.createEl('p', { text: 'Creating PR. This should take less than 1 minute' });
						loading = this.containerEl.createEl('p', { text: 'Loading' });
					}
					setInterval(() => {
						if (loading.innerText === 'Loading') {
							loading.innerText = 'Loading.';
						} else if (loading.innerText === 'Loading.') {
							loading.innerText = 'Loading..';
						} else if (loading.innerText === 'Loading..') {
							loading.innerText = 'Loading...';
						} else {
							loading.innerText = 'Loading';
						}
					}, 400)
					button.setDisabled(true);
					try {
						const prUrl = await this.plugin.updateTemplateFiles()
						this.plugin.settings.prHistory.push(prUrl);
						await this.plugin.saveSettings();
						loading.remove();
						msg.remove();
						const successmessage = { text: `Done! Approve your PR to make the changes go live.` };
						const linkText = { text: `${prUrl}`, href: prUrl };
						if (previousPrs) {
							previousPrs.prepend(document.createDocumentFragment().createEl('br'));
							previousPrs.prepend(document.createDocumentFragment().createEl('a',linkText));
							previousPrs.prepend(document.createDocumentFragment().createEl('h2', successmessage));
						}else{
							this.containerEl.createEl('h2', successmessage);
							this.containerEl.createEl('a', linkText);
							this.containerEl.createEl('br');
						}
					} catch {
						loading.remove();
						msg.remove();
						
						const errorMsg = { text: 'Something went wrong. Try deleting the branch in GitHub.', attr: { style: 'color: red' } };
						if (previousPrs) {
							previousPrs.prepend(document.createDocumentFragment().createEl('p', errorMsg));
						}else{
							this.containerEl.createEl('p', errorMsg);
						}
					}


				})
			);

		if (this.plugin.settings.prHistory.length > 0) {
			previousPrs = containerEl.createEl('h2', { text: 'Previous PRs' });
			for (let prUrl of this.plugin.settings.prHistory.reverse()) {
				containerEl.createEl('a', { text: prUrl, href: prUrl });
				containerEl.createEl('br');
			}
		}



	}
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return Base64.btoa(binary);
}

function extractBaseUrl(url: string) {
	return url && url.replace("https://", "").replace("http://", "").replace(/\/$/, '')
}

