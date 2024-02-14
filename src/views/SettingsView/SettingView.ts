import { Octokit } from "@octokit/core";
import axios from "axios";
import {
	App,
	ButtonComponent,
	debounce,
	getIcon,
	MetadataCache,
	Modal,
	Notice,
	Setting,
	TFile,
} from "obsidian";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

import QuartzSyncerSettings from "../../models/settings";
import Publisher from "../../publisher/Publisher";
import { arrayBufferToBase64 } from "../../utils/utils";
import { SvgFileSuggest } from "../../ui/suggest/file-suggest";
import { addFilterInput } from "./addFilterInput";
import { GithubSettings } from "./GithubSettings";
import RewriteSettings from "./RewriteSettings.svelte";
import {
	hasUpdates,
	TemplateUpdater,
} from "../../repositoryConnection/TemplateManager";
import Logger from "js-logger";

interface IObsidianTheme {
	name: string;
	author: string;
	screenshot: string;
	modes: string[];
	repo: string;
	legacy: boolean;
	// @deprecated
	branch?: string;
}

const OBSIDIAN_THEME_URL =
	"https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json";

export default class SettingView {
	private app: App;
	settings: QuartzSyncerSettings;
	saveSettings: () => Promise<void>;
	private settingsRootElement: HTMLElement;

	debouncedSaveAndUpdate = debounce(
		this.saveSiteSettingsAndUpdateEnv,
		500,
		true,
	);

	constructor(
		app: App,
		settingsRootElement: HTMLElement,
		settings: QuartzSyncerSettings,
		saveSettings: () => Promise<void>,
	) {
		this.app = app;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("settings");
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	getIcon(name: string): Node {
		return getIcon(name) ?? document.createElement("span");
	}

	async initialize(prModal: Modal) {
		this.settingsRootElement.empty();

		this.settingsRootElement.createEl("h1", {
			text: "Quartz Syncer Settings",
		});

		const linkDiv = this.settingsRootElement.createEl("div", {
			attr: { style: "margin-bottom: 10px;" },
		});

		linkDiv.createEl("span", {
			text: "Remember to read the setup guide if you haven't already. It can be found ",
		});

		linkDiv.createEl("a", {
			text: "here.",
			href: "https://docs.ole.dev/getting-started/01-getting-started/",
		});

		const githubSettings = this.settingsRootElement.createEl("div", {
			cls: "connection-status",
		});

		new GithubSettings(this, githubSettings);

		this.settingsRootElement
			.createEl("h3", { text: "URL" })
			.prepend(this.getIcon("link"));
		this.initializeGitHubBaseURLSetting();
		this.initializeSlugifySetting();

		this.settingsRootElement
			.createEl("h3", { text: "Features" })
			.prepend(this.getIcon("star"));
		this.initializeDefaultNoteSettings();

		this.settingsRootElement
			.createEl("h3", { text: "Appearance" })
			.prepend(this.getIcon("brush"));
		this.initializeThemesSettings();

		this.settingsRootElement
			.createEl("h3", { text: "Advanced" })
			.prepend(this.getIcon("cog"));

		new Setting(this.settingsRootElement)
			.setName("Path Rewrite Rules")
			.setDesc(
				"Define rules to rewrite note folder structure in the garden. See the modal for more information.",
			)
			.addButton((cb) => {
				cb.setButtonText("Manage Rewrite Rules");

				cb.onClick(() => {
					this.openPathRewriteRulesModal();
				});
			});
		this.initializeCustomFilterSettings();
		prModal.titleEl.createEl("h1", "Site template settings");
	}

	private async initializeDefaultNoteSettings() {
		const noteSettingsModal = new Modal(this.app);

		noteSettingsModal.titleEl.createEl("h1", {
			text: "Default Note Settings",
		});

		const linkDiv = noteSettingsModal.contentEl.createEl("div", {
			attr: { style: "margin-bottom: 20px; margin-top: -30px;" },
		});
		linkDiv.createEl("span", { text: "Note Setting Docs is available " });

		linkDiv.createEl("a", {
			text: "here.",
			href: "https://docs.ole.dev/getting-started/03-note-settings/",
		});

		// noteSettingsModal.contentEl.createEl("div", { text: `Toggling these settings will update the global default setting for each note.
		// If you want to enable or disable some of these on single notes, use their corresponding key.
		// For example will adding 'show-local-graph: false' to the frontmatter of a note, disable the local graph for that particular note. ` });

		new Setting(this.settingsRootElement)
			.setName("Global Note Settings")
			.setDesc(
				`Default settings for each published note. These can be overwritten per note via frontmatter.`,
			)
			.addButton((cb) => {
				cb.setButtonText("Manage note settings");

				cb.onClick(async () => {
					noteSettingsModal.open();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show home link (home-link)")
			.setDesc(
				"Determines whether to show a link back to the homepage or not.",
			)
			.addToggle((t) => {
				t.setValue(this.settings.defaultNoteSettings.HomeLink);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.HomeLink = val;

					this.saveSiteSettingsAndUpdateEnv(
						this.app.metadataCache,
						this.settings,
						this.saveSettings,
					);
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Let all frontmatter through (pass-frontmatter)")
			.setDesc(
				"THIS WILL BREAK YOUR SITE IF YOU DON'T KNOW WHAT YOU ARE DOING! (But disabling will fix it). Determines whether to let all frontmatter data through to the site template. Be aware that this could break your site if you have data in a format not recognized by the template engine, 11ty.",
			)
			.addToggle((t) => {
				t.setValue(this.settings.defaultNoteSettings.PassFrontmatter);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.PassFrontmatter = val;

					this.saveSiteSettingsAndUpdateEnv(
						this.app.metadataCache,
						this.settings,
						this.saveSettings,
					);
				});
			});
	}

	private async initializeThemesSettings() {
		const themeModal = new Modal(this.app);
		themeModal.containerEl.addClass("settings");
		themeModal.titleEl.createEl("h1", { text: "Appearance Settings" });

		const handleSaveSettingsButton = (cb: ButtonComponent) => {
			cb.setButtonText("Apply settings to site");
			cb.setClass("mod-cta");

			cb.onClick(async (_ev) => {
				const octokit = new Octokit({
					auth: this.settings.githubToken,
				});
				new Notice("Applying settings to site...");
				await this.saveSettingsAndUpdateEnv();
			});
		};

		new Setting(this.settingsRootElement)
			.setName("Appearance")
			.setDesc("Manage themes, sitename and styling on your site")
			.addButton((cb) => {
				cb.setButtonText("Manage appearance");

				cb.onClick(async () => {
					themeModal.open();
				});
			});

		//this.app.plugins is not defined, so we need to use a try catch in case the internal api is changed
		try {
			if (
				// @ts-expect-error https://gist.github.com/aidenlx/6067c943fbec8ead230f2b163bfd3bc8 for typing example
				this.app.plugins &&
				// @ts-expect-error see above
				this.app.plugins.plugins["obsidian-style-settings"]._loaded
			) {
				themeModal.contentEl
					.createEl("h2", { text: "Style Settings Plugin" })
					.prepend(this.getIcon("paintbrush"));

				new Setting(themeModal.contentEl)
					.setName("Apply current style settings to site")
					.setDesc(
						"Click the apply button to use the current style settings from the Style Settings Plugin on your site. (The plugin looks at the currently APPLIED settings. Meaning you need to have the theme you are using in the garden selected in Obsidian before applying)",
					)
					.addButton((btn) => {
						btn.setButtonText("Apply Style Settings");
						btn.setClass("mod-cta");

						btn.onClick(async (_ev) => {
							new Notice("Applying Style Settings...");

							const styleSettingsNode = document.querySelector(
								"#css-settings-manager",
							);

							const bodyClasses =
								document.querySelector("body")?.className;

							if (!styleSettingsNode && !bodyClasses) {
								new Notice("No Style Settings found");

								return;
							}

							if (styleSettingsNode?.innerHTML) {
								this.settings.styleSettingsCss =
									styleSettingsNode?.innerHTML;
							}

							if (bodyClasses) {
								this.settings.styleSettingsBodyClasses = `${bodyClasses}`;
							}

							if (
								!this.settings.styleSettingsCss &&
								!this.settings.styleSettingsBodyClasses
							) {
								new Notice("No Style Settings found");

								return;
							}

							await this.saveSiteSettingsAndUpdateEnv(
								this.app.metadataCache,
								this.settings,
								this.saveSettings,
							);
							new Notice("Style Settings applied to site");
						});
					})
					.addButton((btn) => {
						btn.setButtonText("Clear");

						btn.onClick(async (_ev) => {
							this.settings.styleSettingsCss = "";
							this.settings.styleSettingsBodyClasses = "";

							await this.saveSiteSettingsAndUpdateEnv(
								this.app.metadataCache,
								this.settings,
								this.saveSettings,
							);
							new Notice("Style Settings removed from site");
						});
					});
			}
		} catch {
			console.error("Error loading style settings plugin");
		}
	}

	private async saveSettingsAndUpdateEnv() {
		const quartzManager = new QuartzSyncerSiteManager(
			this.app.metadataCache,
			this.settings,
		);
		await quartzManager.updateEnv();

		new Notice("Successfully applied settings");
	}

	private async saveSiteSettingsAndUpdateEnv(
		metadataCache: MetadataCache,
		settings: QuartzSyncerSettings,
		saveSettings: () => Promise<void>,
	) {
		new Notice("Updating settings...");
		let updateFailed = false;

		try {
			const quartzManager = new QuartzSyncerSiteManager(
				metadataCache,
				settings,
			);
			await quartzManager.updateEnv();
		} catch {
			new Notice(
				"Failed to update settings. Make sure you have an internet connection.",
			);
			updateFailed = true;
		}

		if (!updateFailed) {
			new Notice("Settings successfully updated!");
			await saveSettings();
		}
	}

	private initializeGitHubBaseURLSetting() {
		new Setting(this.settingsRootElement)
			.setName("Base URL")
			.setDesc(
				`This is optional, but recommended. It is used for the "Copy Syncer URL" command, generating a sitemap.xml for better SEO and an RSS feed located at /feed.xml. `,
			)
			.addText((text) =>
				text
					.setPlaceholder("https://my-garden.vercel.app")
					.setValue(this.settings.quartzBaseUrl)
					.onChange(async (value) => {
						this.settings.quartzBaseUrl = value;

						this.debouncedSaveAndUpdate(
							this.app.metadataCache,
							this.settings,
							this.saveSettings,
						);
					}),
			);
	}

	private initializeSlugifySetting() {
		new Setting(this.settingsRootElement)
			.setName("Slugify Note URL")
			.setDesc(
				'Transform the URL from "/My Folder/My Note/" to "/my-folder/my-note". If your note titles contains non-English characters, this should be disabled.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.slugifyEnabled)
					.onChange(async (value) => {
						this.settings.slugifyEnabled = value;
						await this.saveSettings();
					}),
			);
	}

	private openPathRewriteRulesModal() {
		const publisher = new Publisher(
			this.app.vault,
			this.app.metadataCache,
			this.settings,
		);
		const rewriteRulesModal = new Modal(this.app);
		rewriteRulesModal.open();

		const modalContent: RewriteSettings = new RewriteSettings({
			target: rewriteRulesModal.contentEl,
			props: {
				publisher,
				settings: this.settings,
				closeModal: () => rewriteRulesModal.close(),
			},
		});

		rewriteRulesModal.onClose = () => {
			modalContent.$destroy();
		};
	}

	private initializeCustomFilterSettings() {
		const customFilterModal = new Modal(this.app);
		customFilterModal.titleEl.createEl("h1", { text: "Custom Filters" });
		customFilterModal.modalEl.style.width = "fit-content";

		new Setting(this.settingsRootElement)
			.setName("Custom Filters")
			.setDesc(
				"Define custom rules to replace parts of the note before publishing.",
			)
			.addButton((cb) => {
				cb.setButtonText("Manage Custom Filters");

				cb.onClick(() => {
					customFilterModal.open();
				});
			});

		const rewriteSettingsContainer = customFilterModal.contentEl.createEl(
			"div",
			{
				attr: {
					class: "",
					style: "align-items:flex-start; flex-direction: column; margin: 5px;",
				},
			},
		);

		rewriteSettingsContainer.createEl(
			"div",
		).innerHTML = `Define regex filters to replace note content before publishing.`;

		rewriteSettingsContainer.createEl("div", {
			attr: { class: "setting-item-description" },
		}).innerHTML = `Format: [<code>regex pattern</code>, <code>replacement</code>, <code>regex flags</code>]`;

		rewriteSettingsContainer.createEl("div", {
			attr: {
				class: "setting-item-description",
				style: "margin-bottom: 15px",
			},
		}).innerHTML = `Example: filter [<code>:smile:</code>, <code>😀</code>, <code>g</code>] will replace text with real emojis`;

		const customFilters = this.settings.customFilters;

		new Setting(rewriteSettingsContainer)
			.setName("Filters")
			.addButton((button) => {
				button.setButtonText("Add");
				button.setTooltip("Add a filter");
				button.setIcon("plus");

				button.onClick(async () => {
					const customFilters = this.settings.customFilters;

					customFilters.push({
						pattern: "",
						flags: "g",
						replace: "",
					});
					filterList.empty();

					for (let i = 0; i < customFilters.length; i++) {
						addFilterInput(customFilters[i], filterList, i, this);
					}
				});
			});

		const filterList =
			rewriteSettingsContainer.createDiv("custom-filter-list");

		for (let i = 0; i < customFilters.length; i++) {
			addFilterInput(customFilters[i], filterList, i, this);
		}
	}

	async renderCreatePr(
		modal: Modal,
		handlePR: (
			button: ButtonComponent,
			updater: TemplateUpdater,
		) => Promise<void>,
		siteManager: QuartzSyncerSiteManager,
	) {
		this.settingsRootElement
			.createEl("h3", { text: "Update site" })
			.prepend(getIcon("sync") ?? "");

		Logger.time("checkForUpdate");

		const updater = await siteManager.templateUpdater.checkForUpdates();
		Logger.timeEnd("checkForUpdate");

		const updateAvailable = hasUpdates(updater);

		new Setting(this.settingsRootElement)
			.setName("Site Template")
			.setDesc(
				"Manage updates to the base template. You should try updating the template when you update the plugin to make sure your garden support all features.",
			)
			.addButton(async (button) => {
				button.setButtonText(`Checking...`);
				Logger.time("checkForUpdate");

				if (updateAvailable) {
					button.setButtonText(
						`Update to ${updater.newestTemplateVersion}`,
					);
				} else {
					button.setButtonText("Already up to date!");
					button.setDisabled(true);
				}

				button.onClick(() => {
					modal.open();
				});
			});
		modal.titleEl.createEl("h2", { text: "Update site" });

		new Setting(modal.contentEl)
			.setName("Update site to latest template")
			.setDesc(
				`
				This will create a pull request with the latest template changes, which you'll need to use all plugin features. 
				It will not publish any changes before you approve them.
			`,
			)
			.addButton((button) =>
				button
					.setButtonText("Create PR")
					.onClick(() =>
						handlePR(button, updater as TemplateUpdater),
					),
			);

		this.settingsRootElement
			.createEl("h3", { text: "Support" })
			.prepend(this.getIcon("heart"));

		this.settingsRootElement
			.createDiv({
				attr: {
					style: "display:flex; align-items:center; justify-content:center; margin-top: 20px;",
				},
			})
			.createEl("a", {
				attr: { href: "https://ko-fi.com/oleeskild", target: "_blank" },
			})
			.createEl("img", {
				attr: {
					src: "https://cdn.ko-fi.com/cdn/kofi3.png?v=3",
					width: "200",
				},
			});
	}

	renderPullRequestHistory(modal: Modal, previousPrUrls: string[]) {
		if (previousPrUrls.length === 0) {
			return;
		}

		const header = modal.contentEl.createEl("h2", {
			text: "➕ Recent Pull Request History",
		});
		const prsContainer = modal.contentEl.createEl("ul", {});
		prsContainer.hide();

		header.onClickEvent(() => {
			if (prsContainer.isShown()) {
				prsContainer.hide();
				header.textContent = "➕  Recent Pull Request History";
			} else {
				prsContainer.show();
				header.textContent = "➖ Recent Pull Request History";
			}
		});

		previousPrUrls.map((prUrl) => {
			const li = prsContainer.createEl("li", {
				attr: { style: "margin-bottom: 10px" },
			});
			const prUrlElement = document.createElement("a");
			prUrlElement.href = prUrl;
			prUrlElement.textContent = prUrl;
			li.appendChild(prUrlElement);
		});
	}
}
