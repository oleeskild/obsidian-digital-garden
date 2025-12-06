import { Octokit } from "@octokit/core";
import axios from "axios";
import {
	App,
	ButtonComponent,
	debounce,
	DropdownComponent,
	getIcon,
	MetadataCache,
	Modal,
	Notice,
	Setting,
	TextComponent,
	TFile,
	ToggleComponent,
} from "obsidian";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import { Base64 } from "js-base64";

import DigitalGardenSettings from "../../models/settings";
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
import ForestrySettings from "./ForestrySettings.svelte";
import { PublishPlatform } from "src/models/PublishPlatform";

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
	private prModal: Modal | undefined;
	settings: DigitalGardenSettings;
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
		settings: DigitalGardenSettings,
		saveSettings: () => Promise<void>,
	) {
		this.app = app;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("dg-settings");
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	getIcon(name: string): Node {
		return getIcon(name) ?? document.createElement("span");
	}

	private reInitializeSettings() {
		if (this.prModal) {
			this.initialize(this.prModal);
		}
	}

	async initialize(prModal: Modal) {
		this.prModal = prModal;
		this.settingsRootElement.empty();

		this.settingsRootElement.createEl("h1", {
			text: "Digital Garden Settings",
		});

		const linkDiv = this.settingsRootElement.createEl("div", {
			attr: { style: "margin-bottom: 10px;" },
		});

		linkDiv.createEl("span", {
			text: "Remember to read the setup guide if you haven't already. It can be found ",
		});

		linkDiv.createEl("a", {
			text: "here.",
			href: "https://dg-docs.ole.dev/getting-started/01-getting-started/",
		});

		new Setting(this.settingsRootElement)
			.setName("Publish Platform")
			.addDropdown((dd) => {
				dd.addOption(PublishPlatform.SelfHosted, "GitHub/Self Hosted");
				dd.addOption(PublishPlatform.ForestryMd, "Forestry.md");

				if (
					this.settings.publishPlatform === PublishPlatform.SelfHosted
				) {
					dd.setValue(PublishPlatform.SelfHosted);
				} else {
					dd.setValue(PublishPlatform.ForestryMd);
				}

				dd.onChange(async (val) => {
					switch (val) {
						case PublishPlatform.SelfHosted:
							this.settings.publishPlatform =
								PublishPlatform.SelfHosted;
							break;
						case PublishPlatform.ForestryMd:
							this.settings.publishPlatform =
								PublishPlatform.ForestryMd;
							break;
					}
					await this.saveSettings();

					this.initializePublishPlatformSettings(
						publishPlatformSettings,
					);
				});
			});

		const publishPlatformSettings = this.settingsRootElement.createEl(
			"div",
			{
				cls: "connection-status",
			},
		);

		this.initializePublishPlatformSettings(publishPlatformSettings);

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
			.createEl("h3", { text: "Localization" })
			.prepend(this.getIcon("languages"));
		this.initializeUIStringsSettings();

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

	private initializePublishPlatformSettings(target: HTMLElement) {
		target.empty();

		if (this.settings.publishPlatform === PublishPlatform.SelfHosted) {
			new GithubSettings(this, target);
		} else {
			new ForestrySettings({
				target,
				props: {
					settings: this.settings,
					saveSettings: this.saveSettings,
					onConnect: async () => {
						this.reInitializeSettings();
					},
				},
			});
		}
	}

	private async initializeDefaultNoteSettings() {
		const noteSettingsModal = new Modal(this.app);
		let hasUnsavedChanges = false;

		// Store toggle references for updating after fetch
		const toggles: Record<string, ToggleComponent> = {};

		noteSettingsModal.titleEl.createEl("h1", {
			text: "Default Note Settings",
		});

		const linkDiv = noteSettingsModal.contentEl.createEl("div", {
			attr: { style: "margin-bottom: 20px; margin-top: -30px;" },
		});
		linkDiv.createEl("span", { text: "Note Setting Docs is available " });

		linkDiv.createEl("a", {
			text: "here.",
			href: "https://dg-docs.ole.dev/getting-started/03-note-settings/",
		});

		new Setting(this.settingsRootElement)
			.setName("Global Note Settings")
			.setDesc(
				`Default settings for each published note. These can be overwritten per note via frontmatter.`,
			)
			.addButton((cb) => {
				cb.setButtonText("Manage note settings");

				cb.onClick(async () => {
					hasUnsavedChanges = false;
					updateApplyButton();
					noteSettingsModal.open();

					// Load remote settings when modal opens
					await loadRemoteSettings();
				});
			});

		// Helper to mark settings as changed
		const markAsChanged = () => {
			hasUnsavedChanges = true;
			updateApplyButton();
		};

		// Apply button container - styled to stand out
		const applyContainer = noteSettingsModal.contentEl.createDiv({
			cls: "dg-apply-settings-container",
		});

		// Status indicator for unsaved changes
		const statusEl = applyContainer.createDiv({
			cls: "dg-apply-settings-status",
		});

		const applyButton = applyContainer.createEl("button", {
			text: "Apply changes to site",
			cls: "mod-cta dg-apply-settings-button",
		});

		applyButton.addEventListener("click", async () => {
			if (!hasUnsavedChanges) return;

			await this.saveSiteSettingsAndUpdateEnv(
				this.app.metadataCache,
				this.settings,
				this.saveSettings,
			);
			hasUnsavedChanges = false;
			updateApplyButton();
		});

		const updateApplyButton = () => {
			if (hasUnsavedChanges) {
				statusEl.setText("You have unsaved changes");
				statusEl.style.color = "var(--text-warning)";
				applyContainer.classList.add("has-changes");
				applyButton.disabled = false;
			} else {
				statusEl.setText("Change a setting to apply");
				statusEl.style.color = "var(--text-muted)";
				applyContainer.classList.remove("has-changes");
				applyButton.disabled = true;
			}
		};

		// Load settings from remote .env file
		const loadRemoteSettings = async () => {
			statusEl.setText("Loading settings from site...");
			applyContainer.classList.remove("has-changes");

			try {
				const gardenManager = new DigitalGardenSiteManager(
					this.app.metadataCache,
					this.settings,
				);

				const connection =
					await gardenManager.getUserGardenConnection();
				const envFile = await connection.getFile(".env");

				if (envFile?.content) {
					const envContent = Base64.decode(envFile.content);
					const remoteSettings = this.parseEnvSettings(envContent);

					// Update toggles with remote values
					for (const [key, toggle] of Object.entries(toggles)) {
						if (key in remoteSettings) {
							const remoteValue = remoteSettings[key] === "true";
							toggle.setValue(remoteValue);

							// Also update local settings to match
							(
								this.settings.defaultNoteSettings as Record<
									string,
									boolean
								>
							)[key] = remoteValue;
						}
					}
				}

				hasUnsavedChanges = false;
				updateApplyButton();
			} catch (error) {
				console.error("Failed to load remote settings:", error);
				statusEl.setText("Could not load remote settings");
				statusEl.style.color = "var(--text-error)";

				setTimeout(() => {
					statusEl.style.color = "";
					hasUnsavedChanges = false;
					updateApplyButton();
				}, 3000);
			}
		};

		updateApplyButton();

		new Setting(noteSettingsModal.contentEl)
			.setName("Show home link (dg-home-link)")
			.setDesc(
				"Determines whether to show a link back to the homepage or not.",
			)
			.addToggle((t) => {
				toggles["dgHomeLink"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgHomeLink);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgHomeLink = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show local graph for notes (dg-show-local-graph)")
			.setDesc(
				"When turned on, notes will show its local graph in a sidebar on desktop and at the bottom of the page on mobile.",
			)
			.addToggle((t) => {
				toggles["dgShowLocalGraph"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowLocalGraph);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowLocalGraph = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show backlinks for notes (dg-show-backlinks)")
			.setDesc(
				"When turned on, notes will show backlinks in a sidebar on desktop and at the bottom of the page on mobile.",
			)
			.addToggle((t) => {
				toggles["dgShowBacklinks"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowBacklinks);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowBacklinks = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show a table of content for notes (dg-show-toc)")
			.setDesc(
				"When turned on, notes will show all headers as a table of content in a sidebar on desktop. It will not be shown on mobile devices.",
			)
			.addToggle((t) => {
				toggles["dgShowToc"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowToc);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowToc = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show inline title (dg-show-inline-title)")
			.setDesc(
				"When turned on, the title of the note will show on top of the page.",
			)
			.addToggle((t) => {
				toggles["dgShowInlineTitle"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowInlineTitle);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowInlineTitle = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show filetree sidebar (dg-show-file-tree)")
			.setDesc("When turned on, a filetree will be shown on your site.")
			.addToggle((t) => {
				toggles["dgShowFileTree"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowFileTree);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowFileTree = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Enable search (dg-enable-search)")
			.setDesc(
				"When turned on, users will be able to search through the content of your site.",
			)
			.addToggle((t) => {
				toggles["dgEnableSearch"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgEnableSearch);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgEnableSearch = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Enable link preview (dg-link-preview)")
			.setDesc(
				"When turned on, hovering over links to notes in your garden shows a scrollable preview.",
			)
			.addToggle((t) => {
				toggles["dgLinkPreview"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgLinkPreview);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgLinkPreview = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Show Tags (dg-show-tags)")
			.setDesc(
				"When turned on, tags in your frontmatter will be displayed on each note. If search is enabled, clicking on a tag will bring up a search for all notes containing that tag.",
			)
			.addToggle((t) => {
				toggles["dgShowTags"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgShowTags);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgShowTags = val;
					markAsChanged();
				});
			});

		new Setting(noteSettingsModal.contentEl)
			.setName("Let all frontmatter through (dg-pass-frontmatter)")
			.setDesc(
				"THIS WILL BREAK YOUR SITE IF YOU DON'T KNOW WHAT YOU ARE DOING! (But disabling will fix it). Determines whether to let all frontmatter data through to the site template. Be aware that this could break your site if you have data in a format not recognized by the template engine, 11ty.",
			)
			.addToggle((t) => {
				toggles["dgPassFrontmatter"] = t;
				t.setValue(this.settings.defaultNoteSettings.dgPassFrontmatter);

				t.onChange((val) => {
					this.settings.defaultNoteSettings.dgPassFrontmatter = val;
					markAsChanged();
				});
			});
	}

	private async initializeUIStringsSettings() {
		const uiStringsModal = new Modal(this.app);
		uiStringsModal.containerEl.addClass("dg-settings");
		let hasUnsavedChanges = false;

		// Store text control references for updating after fetch
		const textControls: Record<string, TextComponent> = {};

		uiStringsModal.titleEl.createEl("h1", {
			text: "UI Text Settings",
		});

		const descDiv = uiStringsModal.contentEl.createEl("div", {
			attr: { style: "margin-bottom: 20px;" },
		});

		descDiv.createEl("span", {
			text: "Customize text displayed on your garden. Leave empty to use defaults.",
		});

		new Setting(this.settingsRootElement)
			.setName("UI Text / Localization")
			.setDesc(
				"Customize labels and messages shown on your garden (Search, Backlinks, etc.)",
			)
			.addButton((cb) => {
				cb.setButtonText("Manage UI text");

				cb.onClick(async () => {
					hasUnsavedChanges = false;
					updateApplyButton();
					uiStringsModal.open();
					await loadRemoteSettings();
				});
			});

		// Helper to mark settings as changed
		const markAsChanged = () => {
			hasUnsavedChanges = true;
			updateApplyButton();
		};

		// Apply button container
		const applyContainer = uiStringsModal.contentEl.createDiv({
			cls: "dg-apply-settings-container",
		});

		const statusEl = applyContainer.createDiv({
			cls: "dg-apply-settings-status",
		});

		const applyButton = applyContainer.createEl("button", {
			text: "Apply changes to site",
			cls: "mod-cta dg-apply-settings-button",
		});

		applyButton.addEventListener("click", async () => {
			if (!hasUnsavedChanges) return;

			await this.saveSiteSettingsAndUpdateEnv(
				this.app.metadataCache,
				this.settings,
				this.saveSettings,
			);
			hasUnsavedChanges = false;
			updateApplyButton();
		});

		const updateApplyButton = () => {
			if (hasUnsavedChanges) {
				statusEl.setText("You have unsaved changes");
				statusEl.style.color = "var(--text-warning)";
				applyContainer.classList.add("has-changes");
				applyButton.disabled = false;
			} else {
				statusEl.setText("Change a setting to apply");
				statusEl.style.color = "var(--text-muted)";
				applyContainer.classList.remove("has-changes");
				applyButton.disabled = true;
			}
		};

		// Mapping of env keys to control keys and settings keys
		const uiStringsMap: Array<{
			envKey: string;
			controlKey: string;
			settingsKey: keyof typeof this.settings.uiStrings;
		}> = [
			{
				envKey: "UI_BACKLINK_HEADER",
				controlKey: "backlinkHeader",
				settingsKey: "backlinkHeader",
			},
			{
				envKey: "UI_NO_BACKLINKS_MESSAGE",
				controlKey: "noBacklinksMessage",
				settingsKey: "noBacklinksMessage",
			},
			{
				envKey: "UI_SEARCH_BUTTON_TEXT",
				controlKey: "searchButtonText",
				settingsKey: "searchButtonText",
			},
			{
				envKey: "UI_SEARCH_PLACEHOLDER",
				controlKey: "searchPlaceholder",
				settingsKey: "searchPlaceholder",
			},
			{
				envKey: "UI_SEARCH_ENTER_HINT",
				controlKey: "searchEnterHint",
				settingsKey: "searchEnterHint",
			},
			{
				envKey: "UI_SEARCH_NAVIGATE_HINT",
				controlKey: "searchNavigateHint",
				settingsKey: "searchNavigateHint",
			},
			{
				envKey: "UI_SEARCH_CLOSE_HINT",
				controlKey: "searchCloseHint",
				settingsKey: "searchCloseHint",
			},
			{
				envKey: "UI_SEARCH_NO_RESULTS",
				controlKey: "searchNoResults",
				settingsKey: "searchNoResults",
			},
			{
				envKey: "UI_SEARCH_PREVIEW_PLACEHOLDER",
				controlKey: "searchPreviewPlaceholder",
				settingsKey: "searchPreviewPlaceholder",
			},
		];

		// Load settings from remote .env file
		const loadRemoteSettings = async () => {
			statusEl.setText("Loading settings from site...");
			applyContainer.classList.remove("has-changes");

			try {
				const gardenManager = new DigitalGardenSiteManager(
					this.app.metadataCache,
					this.settings,
				);

				const connection =
					await gardenManager.getUserGardenConnection();
				const envFile = await connection.getFile(".env");

				if (envFile?.content) {
					const envContent = Base64.decode(envFile.content);
					const remoteSettings = this.parseEnvSettings(envContent);

					// Update controls with remote values
					for (const mapping of uiStringsMap) {
						const control = textControls[mapping.controlKey];

						if (mapping.envKey in remoteSettings && control) {
							const value = remoteSettings[mapping.envKey];
							control.setValue(value);

							this.settings.uiStrings[mapping.settingsKey] =
								value;
						}
					}
				}

				hasUnsavedChanges = false;
				updateApplyButton();
			} catch (error) {
				console.error("Failed to load remote UI strings:", error);
				statusEl.setText("Could not load remote settings");
				statusEl.style.color = "var(--text-error)";

				setTimeout(() => {
					statusEl.style.color = "";
					hasUnsavedChanges = false;
					updateApplyButton();
				}, 3000);
			}
		};

		updateApplyButton();

		// Backlinks Section
		uiStringsModal.contentEl
			.createEl("h3", { text: "Backlinks" })
			.prepend(this.getIcon("link"));

		new Setting(uiStringsModal.contentEl)
			.setName("Backlink header")
			.setDesc('Default: "Pages mentioning this page"')
			.addText((text) => {
				textControls["backlinkHeader"] = text;

				text.setPlaceholder("Pages mentioning this page")
					.setValue(this.settings.uiStrings?.backlinkHeader ?? "")
					.onChange((val) => {
						this.settings.uiStrings.backlinkHeader = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("No backlinks message")
			.setDesc('Default: "No other pages mentions this page"')
			.addText((text) => {
				textControls["noBacklinksMessage"] = text;

				text.setPlaceholder("No other pages mentions this page")
					.setValue(this.settings.uiStrings?.noBacklinksMessage ?? "")
					.onChange((val) => {
						this.settings.uiStrings.noBacklinksMessage = val;
						markAsChanged();
					});
			});

		// Search Section
		uiStringsModal.contentEl
			.createEl("h3", { text: "Search" })
			.prepend(this.getIcon("search"));

		new Setting(uiStringsModal.contentEl)
			.setName("Search button text")
			.setDesc('Default: "Search"')
			.addText((text) => {
				textControls["searchButtonText"] = text;

				text.setPlaceholder("Search")
					.setValue(this.settings.uiStrings?.searchButtonText ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchButtonText = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("Search placeholder")
			.setDesc('Default: "Start typing..."')
			.addText((text) => {
				textControls["searchPlaceholder"] = text;

				text.setPlaceholder("Start typing...")
					.setValue(this.settings.uiStrings?.searchPlaceholder ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchPlaceholder = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("Enter to select hint")
			.setDesc('Default: "Enter to select"')
			.addText((text) => {
				textControls["searchEnterHint"] = text;

				text.setPlaceholder("Enter to select")
					.setValue(this.settings.uiStrings?.searchEnterHint ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchEnterHint = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("Navigate hint")
			.setDesc('Default: "to navigate"')
			.addText((text) => {
				textControls["searchNavigateHint"] = text;

				text.setPlaceholder("to navigate")
					.setValue(this.settings.uiStrings?.searchNavigateHint ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchNavigateHint = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("Close hint")
			.setDesc('Default: "ESC to close"')
			.addText((text) => {
				textControls["searchCloseHint"] = text;

				text.setPlaceholder("ESC to close")
					.setValue(this.settings.uiStrings?.searchCloseHint ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchCloseHint = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("No results message")
			.setDesc('Default: "No results for"')
			.addText((text) => {
				textControls["searchNoResults"] = text;

				text.setPlaceholder("No results for")
					.setValue(this.settings.uiStrings?.searchNoResults ?? "")
					.onChange((val) => {
						this.settings.uiStrings.searchNoResults = val;
						markAsChanged();
					});
			});

		new Setting(uiStringsModal.contentEl)
			.setName("Preview placeholder text")
			.setDesc('Default: "Select a result to preview"')
			.addText((text) => {
				textControls["searchPreviewPlaceholder"] = text;

				text.setPlaceholder("Select a result to preview")
					.setValue(
						this.settings.uiStrings?.searchPreviewPlaceholder ?? "",
					)
					.onChange((val) => {
						this.settings.uiStrings.searchPreviewPlaceholder = val;
						markAsChanged();
					});
			});
	}

	private async initializeThemesSettings() {
		const themeModal = new Modal(this.app);
		themeModal.containerEl.addClass("dg-settings");
		themeModal.titleEl.createEl("h1", { text: "Appearance Settings" });

		// Store control references for updating after fetch
		const controls: {
			baseTheme: DropdownComponent | null;
			siteName: TextComponent | null;
			mainLanguage: TextComponent | null;
			useFullResolutionImages: ToggleComponent | null;
			timestampFormat: TextComponent | null;
			showCreatedTimestamp: ToggleComponent | null;
			showUpdatedTimestamp: ToggleComponent | null;
			defaultNoteIcon: TextComponent | null;
			showNoteIconOnTitle: ToggleComponent | null;
			showNoteIconInFileTree: ToggleComponent | null;
			showNoteIconOnInternalLink: ToggleComponent | null;
			showNoteIconOnBackLink: ToggleComponent | null;
		} = {
			baseTheme: null,
			siteName: null,
			mainLanguage: null,
			useFullResolutionImages: null,
			timestampFormat: null,
			showCreatedTimestamp: null,
			showUpdatedTimestamp: null,
			defaultNoteIcon: null,
			showNoteIconOnTitle: null,
			showNoteIconInFileTree: null,
			showNoteIconOnInternalLink: null,
			showNoteIconOnBackLink: null,
		};

		// Status indicator for loading remote settings
		const statusEl = themeModal.contentEl.createDiv({
			cls: "dg-appearance-status",
		});

		// Mapping of env keys to control keys and settings keys
		const settingsMap: Array<{
			envKey: string;
			controlKey: keyof typeof controls;
			settingsKey: keyof typeof this.settings;
			isBoolean: boolean;
		}> = [
			{
				envKey: "BASE_THEME",
				controlKey: "baseTheme",
				settingsKey: "baseTheme",
				isBoolean: false,
			},
			{
				envKey: "SITE_NAME_HEADER",
				controlKey: "siteName",
				settingsKey: "siteName",
				isBoolean: false,
			},
			{
				envKey: "SITE_MAIN_LANGUAGE",
				controlKey: "mainLanguage",
				settingsKey: "mainLanguage",
				isBoolean: false,
			},
			{
				envKey: "USE_FULL_RESOLUTION_IMAGES",
				controlKey: "useFullResolutionImages",
				settingsKey: "useFullResolutionImages",
				isBoolean: true,
			},
			{
				envKey: "TIMESTAMP_FORMAT",
				controlKey: "timestampFormat",
				settingsKey: "timestampFormat",
				isBoolean: false,
			},
			{
				envKey: "SHOW_CREATED_TIMESTAMP",
				controlKey: "showCreatedTimestamp",
				settingsKey: "showCreatedTimestamp",
				isBoolean: true,
			},
			{
				envKey: "SHOW_UPDATED_TIMESTAMP",
				controlKey: "showUpdatedTimestamp",
				settingsKey: "showUpdatedTimestamp",
				isBoolean: true,
			},
			{
				envKey: "NOTE_ICON_DEFAULT",
				controlKey: "defaultNoteIcon",
				settingsKey: "defaultNoteIcon",
				isBoolean: false,
			},
			{
				envKey: "NOTE_ICON_TITLE",
				controlKey: "showNoteIconOnTitle",
				settingsKey: "showNoteIconOnTitle",
				isBoolean: true,
			},
			{
				envKey: "NOTE_ICON_FILETREE",
				controlKey: "showNoteIconInFileTree",
				settingsKey: "showNoteIconInFileTree",
				isBoolean: true,
			},
			{
				envKey: "NOTE_ICON_INTERNAL_LINKS",
				controlKey: "showNoteIconOnInternalLink",
				settingsKey: "showNoteIconOnInternalLink",
				isBoolean: true,
			},
			{
				envKey: "NOTE_ICON_BACK_LINKS",
				controlKey: "showNoteIconOnBackLink",
				settingsKey: "showNoteIconOnBackLink",
				isBoolean: true,
			},
		];

		// Load settings from remote .env file
		const loadRemoteSettings = async () => {
			statusEl.setText("Loading settings from site...");

			try {
				const gardenManager = new DigitalGardenSiteManager(
					this.app.metadataCache,
					this.settings,
				);

				const connection =
					await gardenManager.getUserGardenConnection();
				const envFile = await connection.getFile(".env");

				if (envFile?.content) {
					const envContent = Base64.decode(envFile.content);
					const remoteSettings = this.parseEnvSettings(envContent);

					// Update controls with remote values using the mapping
					for (const mapping of settingsMap) {
						const control = controls[mapping.controlKey];

						if (mapping.envKey in remoteSettings && control) {
							const rawValue = remoteSettings[mapping.envKey];

							const value = mapping.isBoolean
								? rawValue === "true"
								: rawValue;
							control.setValue(value as never);

							(this.settings as Record<string, unknown>)[
								mapping.settingsKey
							] = value;
						}
					}

					statusEl.setText("Settings loaded from site");

					setTimeout(() => {
						statusEl.setText("");
					}, 2000);
				}
			} catch (error) {
				console.error(
					"Failed to load remote appearance settings:",
					error,
				);
				statusEl.setText("Could not load settings from site");
				statusEl.addClass("is-error");

				setTimeout(() => {
					statusEl.setText("");
					statusEl.removeClass("is-error");
				}, 3000);
			}
		};

		const handleSaveSettingsButton = (cb: ButtonComponent) => {
			cb.setButtonText("Apply settings to site");
			cb.setCta();

			cb.onClick(async (_ev) => {
				const octokit = new Octokit({
					auth: this.settings.githubToken,
				});
				new Notice("Applying settings to site...");
				await this.saveSettingsAndUpdateEnv();
				await this.addFavicon(octokit);
			});
		};

		new Setting(this.settingsRootElement)
			.setName("Appearance")
			.setDesc("Manage themes, sitename and styling on your site")
			.addButton((cb) => {
				cb.setButtonText("Manage appearance");

				cb.onClick(async () => {
					themeModal.open();
					await loadRemoteSettings();
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
				// Style Settings Plugin Section
				const styleSettingsSection = themeModal.contentEl.createDiv({
					cls: "dg-settings-section",
				});

				styleSettingsSection
					.createEl("h3", { text: "Style Settings Plugin" })
					.prepend(this.getIcon("paintbrush"));

				new Setting(styleSettingsSection)
					.setName("Apply current style settings to site")
					.setDesc(
						"Click the apply button to use the current style settings from the Style Settings Plugin on your site. (The plugin looks at the currently APPLIED settings. Meaning you need to have the theme you are using in the garden selected in Obsidian before applying)",
					)
					.addButton((btn) => {
						btn.setButtonText("Apply Style Settings");
						btn.setCta();

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

		// Theme Settings Section
		const themeSection = themeModal.contentEl.createDiv({
			cls: "dg-settings-section",
		});

		themeSection
			.createEl("h3", { text: "Theme Settings" })
			.prepend(this.getIcon("palette"));

		const themesListResponse =
			await axios.get<IObsidianTheme[]>(OBSIDIAN_THEME_URL);

		const sortedThemes = themesListResponse.data.sort(
			(a: { name: string }, b: { name: string }) =>
				a.name.localeCompare(b.name),
		);

		// Theme picker container
		const themePickerContainer = themeSection.createDiv({
			cls: "dg-theme-picker-container",
		});

		// Current theme display
		const currentThemeDisplay = themePickerContainer.createDiv({
			cls: "dg-current-theme",
		});

		const updateCurrentThemeDisplay = () => {
			const currentTheme = JSON.parse(this.settings.theme);
			currentThemeDisplay.empty();
			currentThemeDisplay.createEl("span", { text: "Current theme: " });
			currentThemeDisplay.createEl("strong", { text: currentTheme.name });
		};
		updateCurrentThemeDisplay();

		// Search input
		const searchInput = themePickerContainer.createEl("input", {
			type: "text",
			placeholder: "Search themes...",
			cls: "dg-theme-search",
		});

		// Theme grid
		const themeGrid = themePickerContainer.createDiv({
			cls: "dg-theme-grid",
		});

		const createThemeCard = (
			theme: IObsidianTheme & { cssUrl?: string },
			isDefault = false,
		) => {
			const themeValue = isDefault
				? '{"name": "default", "modes": ["dark"]}'
				: JSON.stringify({
						...theme,
						cssUrl: `https://raw.githubusercontent.com/${
							theme.repo
						}/${theme.branch || "HEAD"}/${
							theme.legacy ? "obsidian.css" : "theme.css"
						}`,
				  });

			const isSelected = this.settings.theme === themeValue;

			const card = themeGrid.createDiv({
				cls: `dg-theme-card${isSelected ? " is-selected" : ""}`,
			});

			// Screenshot container
			const imgContainer = card.createDiv({ cls: "dg-theme-card-image" });

			if (isDefault) {
				imgContainer.createDiv({
					cls: "dg-theme-card-placeholder",
					text: "Default",
				});
			} else {
				const img = imgContainer.createEl("img", {
					attr: {
						src: `https://raw.githubusercontent.com/${theme.repo}/${
							theme.branch || "HEAD"
						}/${theme.screenshot}`,
						loading: "lazy",
					},
				});

				img.onerror = () => {
					img.style.display = "none";

					imgContainer.createDiv({
						cls: "dg-theme-card-placeholder",
						text: "No preview",
					});
				};
			}

			// Theme name
			card.createDiv({
				cls: "dg-theme-card-name",
				text: isDefault ? "Default" : theme.name,
			});

			card.addEventListener("click", async () => {
				this.settings.theme = themeValue;
				await this.saveSettings();
				updateCurrentThemeDisplay();

				// Update selection state on all cards
				themeGrid
					.querySelectorAll(".dg-theme-card")
					.forEach((c) => c.removeClass("is-selected"));
				card.addClass("is-selected");
			});

			return card;
		};

		// Render theme cards
		const renderThemes = (filter = "") => {
			themeGrid.empty();

			// Add default theme first
			const defaultTheme = {
				name: "Default",
				author: "",
				screenshot: "",
				modes: ["dark"],
				repo: "",
				legacy: false,
			};

			if ("default".includes(filter.toLowerCase())) {
				createThemeCard(defaultTheme, true);
			}

			// Add filtered themes
			sortedThemes
				.filter((t) =>
					t.name.toLowerCase().includes(filter.toLowerCase()),
				)
				.forEach((theme) => createThemeCard(theme));
		};

		renderThemes();

		// Search functionality
		searchInput.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			renderThemes(target.value);
		});

		new Setting(themeSection).setName("Base theme").addDropdown((dd) => {
			controls.baseTheme = dd;
			dd.addOption("dark", "Dark");
			dd.addOption("light", "Light");
			dd.setValue(this.settings.baseTheme);

			dd.onChange(async (val: string) => {
				this.settings.baseTheme = val;
				await this.saveSettings();
			});
		});

		new Setting(themeSection)
			.setName("Sitename")
			.setDesc(
				"The name of your site. This will be displayed as the site header.",
			)
			.addText((text) => {
				controls.siteName = text;

				text.setValue(this.settings.siteName).onChange(
					async (value) => {
						this.settings.siteName = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(themeSection)
			.setName("Main language")
			.setDesc(
				"Language code (ISO 639-1) for the main language of your site. This is used to set the correct language on your site to assist search engines and browsers.",
			)
			.addText((text) => {
				controls.mainLanguage = text;

				text.setValue(this.settings.mainLanguage).onChange(
					async (value) => {
						this.settings.mainLanguage = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(themeSection)
			.setName("Favicon")
			.setDesc(
				"Path to an svg in your vault you wish to use as a favicon. Leave blank to use default. Must be square! (eg. 16x16)",
			)
			.addText((tc) => {
				tc.setPlaceholder("myfavicon.svg");
				tc.setValue(this.settings.faviconPath);

				tc.onChange(async (val) => {
					this.settings.faviconPath = val;
					await this.saveSettings();
				});
				new SvgFileSuggest(this.app, tc.inputEl);
			});

		new Setting(themeSection)
			.setName("Use full resolution images")
			.setDesc(
				"By default, the images on your site are compressed to make your site load faster. If you instead want to use the full resolution images, enable this setting.",
			)
			.addToggle((toggle) => {
				controls.useFullResolutionImages = toggle;
				toggle.setValue(this.settings.useFullResolutionImages);

				toggle.onChange(async (val) => {
					this.settings.useFullResolutionImages = val;
					await this.saveSettings();
				});
			});

		new Setting(themeSection)
			.setClass("dg-apply-button-container")
			.addButton(handleSaveSettingsButton);

		// Timestamps Settings Section
		const timestampsSection = themeModal.contentEl.createDiv({
			cls: "dg-settings-section",
		});

		timestampsSection
			.createEl("h3", { text: "Timestamps Settings" })
			.prepend(this.getIcon("calendar-clock"));

		new Setting(timestampsSection)
			.setName("Timestamp format")
			.setDesc(
				"The format string to render timestamp on the garden. Must be luxon compatible",
			)
			.addText((text) => {
				controls.timestampFormat = text;

				text.setValue(this.settings.timestampFormat).onChange(
					async (value) => {
						this.settings.timestampFormat = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(timestampsSection)
			.setName("Show created timestamp")
			.addToggle((t) => {
				controls.showCreatedTimestamp = t;

				t.setValue(this.settings.showCreatedTimestamp).onChange(
					async (value) => {
						this.settings.showCreatedTimestamp = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(timestampsSection)
			.setName("Created timestamp Frontmatter Key")
			.setDesc(
				"Key to get the created timestamp from the frontmatter. Leave blank to get the value from file creation time. The value can be any value that luxon Datetime.fromISO can parse.",
			)
			.addText((text) =>
				text
					.setValue(this.settings.createdTimestampKey)
					.onChange(async (value) => {
						this.settings.createdTimestampKey = value;
						await this.saveSettings();
					}),
			);

		new Setting(timestampsSection)
			.setName("Show updated timestamp")
			.addToggle((t) => {
				controls.showUpdatedTimestamp = t;

				t.setValue(this.settings.showUpdatedTimestamp).onChange(
					async (value) => {
						this.settings.showUpdatedTimestamp = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(timestampsSection)
			.setName("Updated timestamp Frontmatter Key")
			.setDesc(
				"Key to get the updated timestamp from the frontmatter. Leave blank to get the value from file update time. The value can be any value that luxon Datetime.fromISO can parse.",
			)
			.addText((text) =>
				text
					.setValue(this.settings.updatedTimestampKey)
					.onChange(async (value) => {
						this.settings.updatedTimestampKey = value;
						await this.saveSettings();
					}),
			);

		new Setting(timestampsSection)
			.setClass("dg-apply-button-container")
			.addButton(handleSaveSettingsButton);

		// CSS Settings Section
		const cssSection = themeModal.contentEl.createDiv({
			cls: "dg-settings-section",
		});

		cssSection
			.createEl("h3", { text: "CSS settings" })
			.prepend(this.getIcon("code"));

		new Setting(cssSection)
			.setName("Body Classes Key")
			.setDesc(
				"Key for setting css-classes to the note body from the frontmatter.",
			)
			.addText((text) =>
				text
					.setValue(this.settings.contentClassesKey)
					.onChange(async (value) => {
						this.settings.contentClassesKey = value;
						await this.saveSettings();
					}),
			);

		new Setting(cssSection)
			.setClass("dg-apply-button-container")
			.addButton(handleSaveSettingsButton);

		// Note Icons Settings Section
		const noteIconsSection = themeModal.contentEl.createDiv({
			cls: "dg-settings-section",
		});

		noteIconsSection
			.createEl("h3", { text: "Note icons Settings" })
			.prepend(this.getIcon("image"));

		noteIconsSection
			.createEl("div", { cls: "dg-docs-link" })
			.createEl("a", {
				text: "Documentation on note icons",
				href: "https://dg-docs.ole.dev/advanced/note-specific-settings/#note-icons",
			});

		new Setting(noteIconsSection)
			.setName("Note icon Frontmatter Key")
			.setDesc("Key to get the note icon value from the frontmatter")
			.addText((text) =>
				text
					.setValue(this.settings.noteIconKey)
					.onChange(async (value) => {
						this.settings.noteIconKey = value;
						await this.saveSettings();
					}),
			);

		new Setting(noteIconsSection)
			.setName("Default note icon Value")
			.setDesc("The default value for note icon if not specified")
			.addText((text) => {
				controls.defaultNoteIcon = text;

				text.setValue(this.settings.defaultNoteIcon).onChange(
					async (value) => {
						this.settings.defaultNoteIcon = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(noteIconsSection)
			.setName("Show note icon on Title")
			.addToggle((t) => {
				controls.showNoteIconOnTitle = t;

				t.setValue(this.settings.showNoteIconOnTitle).onChange(
					async (value) => {
						this.settings.showNoteIconOnTitle = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(noteIconsSection)
			.setName("Show note icon in FileTree")
			.addToggle((t) => {
				controls.showNoteIconInFileTree = t;

				t.setValue(this.settings.showNoteIconInFileTree).onChange(
					async (value) => {
						this.settings.showNoteIconInFileTree = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(noteIconsSection)
			.setName("Show note icon on Internal Links")
			.addToggle((t) => {
				controls.showNoteIconOnInternalLink = t;

				t.setValue(this.settings.showNoteIconOnInternalLink).onChange(
					async (value) => {
						this.settings.showNoteIconOnInternalLink = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(noteIconsSection)
			.setName("Show note icon on Backlinks")
			.addToggle((t) => {
				controls.showNoteIconOnBackLink = t;

				t.setValue(this.settings.showNoteIconOnBackLink).onChange(
					async (value) => {
						this.settings.showNoteIconOnBackLink = value;
						await this.saveSettings();
					},
				);
			});

		new Setting(noteIconsSection)
			.setClass("dg-apply-button-container")
			.addButton(handleSaveSettingsButton);
	}

	private async saveSettingsAndUpdateEnv() {
		const theme = JSON.parse(this.settings.theme);
		const baseTheme = this.settings.baseTheme;

		if (theme.modes.indexOf(baseTheme) < 0) {
			new Notice(
				`The ${theme.name} theme doesn't support ${baseTheme} mode.`,
			);

			return;
		}

		const gardenManager = new DigitalGardenSiteManager(
			this.app.metadataCache,
			this.settings,
		);
		await gardenManager.updateEnv();

		new Notice("Successfully applied settings");
	}

	private async saveSiteSettingsAndUpdateEnv(
		metadataCache: MetadataCache,
		settings: DigitalGardenSettings,
		saveSettings: () => Promise<void>,
	) {
		new Notice("Updating settings...");
		let updateFailed = false;

		try {
			const gardenManager = new DigitalGardenSiteManager(
				metadataCache,
				settings,
			);
			await gardenManager.updateEnv();
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

	private parseEnvSettings(envContent: string): Record<string, string> {
		const settings: Record<string, string> = {};

		for (const line of envContent.split("\n")) {
			const trimmedLine = line.trim();

			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			const [key, ...valueParts] = trimmedLine.split("=");

			if (key) {
				settings[key.trim()] = valueParts.join("=").trim();
			}
		}

		return settings;
	}

	private async addFavicon(octokit: Octokit) {
		let base64SettingsFaviconContent = "";

		if (this.settings.faviconPath) {
			const faviconFile = this.app.vault.getAbstractFileByPath(
				this.settings.faviconPath,
			);

			if (!(faviconFile instanceof TFile)) {
				new Notice(`${this.settings.faviconPath} is not a valid file.`);

				return;
			}
			const faviconContent = await this.app.vault.readBinary(faviconFile);
			base64SettingsFaviconContent = arrayBufferToBase64(faviconContent);
		} else {
			const defaultFavicon = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					owner: "oleeskild",
					repo: "digitalgarden",
					path: "src/site/favicon.svg",
				},
			);
			// @ts-expect-error TODO: abstract octokit response
			base64SettingsFaviconContent = defaultFavicon.data.content;
		}

		//The getting and setting sha when putting can be generalized into a utility function
		let faviconExists = true;
		let faviconsAreIdentical = false;
		let currentFaviconOnSite = null;

		try {
			currentFaviconOnSite = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					owner: this.settings.githubUserName,
					repo: this.settings.githubRepo,
					path: "src/site/favicon.svg",
				},
			);

			faviconsAreIdentical =
				// @ts-expect-error TODO: abstract octokit response
				currentFaviconOnSite.data.content ===
				base64SettingsFaviconContent;

			if (faviconsAreIdentical) {
				Logger.info("Favicons are identical, skipping update");

				return;
			}
		} catch (error) {
			faviconExists = false;
		}

		if (!faviconExists || !faviconsAreIdentical) {
			await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
				owner: this.settings.githubUserName,
				repo: this.settings.githubRepo,
				path: "src/site/favicon.svg",
				message: `Update favicon.svg`,
				content: base64SettingsFaviconContent,
				// @ts-expect-error TODO: abstract octokit response
				sha: faviconExists ? currentFaviconOnSite.data.sha : null,
			});
		}
	}

	private initializeGitHubBaseURLSetting() {
		const siteBaseUrl = new Setting(this.settingsRootElement)
			.setName("Base URL")
			.setDesc(
				`This is optional, but recommended. It is used for the "Copy Garden URL" command, generating a sitemap.xml for better SEO and an RSS feed located at /feed.xml. `,
			);

		if (this.settings.publishPlatform === PublishPlatform.ForestryMd) {
			siteBaseUrl.addText((text) =>
				text
					.setPlaceholder("https://my-garden.forestry.md")
					.setValue(this.settings.forestrySettings.baseUrl)
					.onChange(async (value) => {
						this.settings.forestrySettings.baseUrl = value;

						this.debouncedSaveAndUpdate(
							this.app.metadataCache,
							this.settings,
							this.saveSettings,
						);
					}),
			);
		} else {
			siteBaseUrl.addText((text) =>
				text
					.setPlaceholder("https://my-garden.vercel.app")
					.setValue(this.settings.gardenBaseUrl)
					.onChange(async (value) => {
						this.settings.gardenBaseUrl = value;

						this.debouncedSaveAndUpdate(
							this.app.metadataCache,
							this.settings,
							this.saveSettings,
						);
					}),
			);
		}
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
		siteManager: DigitalGardenSiteManager,
	) {
		this.settingsRootElement
			.createEl("h3", { text: "Update site" })
			.prepend(getIcon("sync") ?? "");

		Logger.time("checkForUpdate");

		const updater = await (
			await siteManager.getTemplateUpdater()
		).checkForUpdates();
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
					button.setCta();
				} else {
					button.setButtonText("Already up to date!");
					button.setDisabled(true);
				}

				button.onClick(() => {
					modal.open();
				});
			});

		// Modal title
		modal.titleEl.empty();

		const titleContainer = modal.titleEl.createDiv({
			cls: "dg-modal-title",
		});
		const syncIcon = getIcon("refresh-cw");

		if (syncIcon) {
			titleContainer.appendChild(syncIcon);
		}
		titleContainer.createSpan({ text: "Update Site Template" });

		// Modal content
		const updateSection = modal.contentEl.createDiv({
			cls: "dg-update-section",
		});

		const infoContainer = updateSection.createDiv({
			cls: "dg-update-info",
		});

		const infoIcon = getIcon("info");

		if (infoIcon) {
			infoContainer.appendChild(infoIcon);
		}

		infoContainer.createDiv({
			cls: "dg-update-info-text",
			text: "This will create a pull request with the latest template changes. Your site won't be updated until you approve the PR.",
		});

		const buttonContainer = updateSection.createDiv({
			cls: "dg-update-button-container",
		});

		const createPrButton = buttonContainer.createEl("button", {
			text: "Create Pull Request",
			cls: "mod-cta",
		});

		createPrButton.addEventListener("click", () => {
			handlePR(
				{
					setDisabled: (d) => (createPrButton.disabled = d),
				} as ButtonComponent,
				updater as TemplateUpdater,
			);
		});

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

		const historySection = modal.contentEl.createDiv({
			cls: "dg-pr-history",
		});

		const header = historySection.createDiv({
			cls: "dg-pr-history-header",
		});

		const chevronIcon = getIcon("chevron-right");

		if (chevronIcon) {
			header.appendChild(chevronIcon);
		}

		header.createSpan({ text: "Recent Pull Requests" });

		const prsContainer = historySection.createDiv({
			cls: "dg-pr-history-list",
		});
		prsContainer.hide();

		header.addEventListener("click", () => {
			const chevron = header.querySelector(".svg-icon");

			if (prsContainer.isShown()) {
				prsContainer.hide();
				chevron?.removeClass("is-expanded");
			} else {
				prsContainer.show();
				chevron?.addClass("is-expanded");
			}
		});

		previousPrUrls.forEach((prUrl) => {
			const prItem = prsContainer.createDiv({
				cls: "dg-pr-history-item",
			});

			const gitPrIcon = getIcon("git-pull-request");

			if (gitPrIcon) {
				prItem.appendChild(gitPrIcon);
			}

			// Extract PR number from URL for display
			const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
			const displayText = prNumber ? `Pull Request #${prNumber}` : prUrl;

			prItem.createEl("a", {
				text: displayText,
				href: prUrl,
				cls: "dg-pr-history-link",
			});
		});
	}
}
