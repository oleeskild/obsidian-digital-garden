import {
	Notice,
	Platform,
	Plugin,
	Workspace,
	addIcon,
	TFile,
	Modal,
	App,
} from "obsidian";
import Publisher from "./src/publisher/Publisher";
import DigitalGardenSettings from "./src/models/settings";
import { PublishStatusBar } from "./src/views/PublishStatusBar";
import { seedling } from "src/ui/suggest/constants";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import { DigitalGardenSettingTab } from "./src/views/DigitalGardenSettingTab";
import Logger from "js-logger";
import { PublishFile } from "./src/publishFile/PublishFile";
import { FRONTMATTER_KEYS } from "./src/publishFile/FileMetaDataManager";
import { PublishPlatform } from "src/models/PublishPlatform";

// Process environment variables are provided through esbuild's define feature
// See esbuild.config.mjs

const defaultTheme = {
	name: "Red Graphite",
	author: "SeanWcom",
	repo: "seanwcom/Red-Graphite-for-Obsidian",
	screenshot: "thumbnail.png",
	modes: ["dark", "light"],
	cssUrl: "https://raw.githubusercontent.com/seanwcom/Red-Graphite-for-Obsidian/HEAD/theme.css",
};

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: "",
	githubToken: "",
	githubUserName: "",
	gardenBaseUrl: "",
	prHistory: [],
	baseTheme: "dark",
	// Stringify to be backwards compatible with older versions
	theme: JSON.stringify(defaultTheme),
	faviconPath: "",
	logoPath: "",
	useFullResolutionImages: false,
	noteSettingsIsInitialized: false,
	siteName: "Digital Garden",
	mainLanguage: "en",
	slugifyEnabled: true,
	// Note Icon Related Settings
	noteIconKey: "dg-note-icon",
	defaultNoteIcon: "",
	showNoteIconOnTitle: false,
	showNoteIconInFileTree: false,
	showNoteIconOnInternalLink: false,
	showNoteIconOnBackLink: false,

	// Timestamp related settings
	showCreatedTimestamp: false,
	createdTimestampKey: "",
	showUpdatedTimestamp: false,
	updatedTimestampKey: "",
	timestampFormat: "MMM dd, yyyy h:mm a",

	styleSettingsCss: "",
	styleSettingsBodyClasses: "",
	pathRewriteRules: "",
	customFilters: [],
	publishPlatform: PublishPlatform.SelfHosted,

	contentClassesKey: "dg-content-classes",

	forestrySettings: {
		forestryPageName: "",
		apiKey: "",
		baseUrl: "",
	},

	defaultNoteSettings: {
		dgHomeLink: true,
		dgPassFrontmatter: false,
		dgShowBacklinks: false,
		dgShowLocalGraph: false,
		dgShowInlineTitle: false,
		dgShowFileTree: false,
		dgEnableSearch: false,
		dgShowToc: false,
		dgLinkPreview: false,
		dgShowTags: false,
	},

	uiStrings: {
		backlinkHeader: "",
		noBacklinksMessage: "",
		searchButtonText: "",
		searchPlaceholder: "",
		searchEnterHint: "",
		searchNavigateHint: "",
		searchCloseHint: "",
		searchNoResults: "",
		searchPreviewPlaceholder: "",
	},

	logLevel: undefined,
};

Logger.useDefaults({
	defaultLevel: Logger.WARN,
	formatter: function (messages, _context) {
		messages.unshift(new Date().toUTCString());
		messages.unshift("DG: ");
	},
});
export default class DigitalGarden extends Plugin {
	settings!: DigitalGardenSettings;
	appVersion!: string;

	publishModal!: PublicationCenter;
	isPublishing: boolean = false;

	async onload() {
		this.appVersion = this.manifest.version;

		console.log("Initializing DigitalGarden plugin v" + this.appVersion);
		await this.loadSettings();

		this.settings.logLevel && Logger.setLevel(this.settings.logLevel);

		Logger.info(
			"Digital garden log level set to " + Logger.getLevel().name,
		);
		this.addSettingTab(new DigitalGardenSettingTab(this.app, this));

		await this.addCommands();

		addIcon("digital-garden-icon", seedling);

		this.addRibbonIcon(
			"digital-garden-icon",
			"Digital Garden Publication Center",
			async () => {
				this.openPublishModal();
			},
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async addCommands() {
		this.addCommand({
			id: "quick-publish-and-share-note",
			name: "Quick Publish And Share Note",
			callback: async () => {
				new Notice("Adding publish flag to note and publishing it.");
				await this.setPublishFlagValue(true);
				const activeFile = this.app.workspace.getActiveFile();

				const event = this.app.metadataCache.on(
					"changed",
					async (file, _data, _cache) => {
						if (file.path === activeFile?.path) {
							const successfullyPublished =
								await this.publishSingleNote();

							if (successfullyPublished) {
								await this.copyGardenUrlToClipboard();
							}
							this.app.metadataCache.offref(event);
						}
					},
				);

				// Remove the event listener after 5 seconds in case the file is not changed.
				setTimeout(() => {
					this.app.metadataCache.offref(event);
				}, 5000);
			},
		});

		this.addCommand({
			id: "publish-note",
			name: "Publish Active Note",
			callback: async () => {
				await this.publishSingleNote();
			},
		});

		if (this.settings["ENABLE_DEVELOPER_TOOLS"] && Platform.isDesktop) {
			Logger.info("Developer tools enabled");

			const publisher = new Publisher(
				this.app.vault,
				this.app.metadataCache,
				this.settings,
			);

			import("./src/test/snapshot/generateGardenSnapshot")
				.then((snapshotGen) => {
					this.addCommand({
						id: "generate-garden-snapshot",
						name: "Generate Garden Snapshot",
						callback: async () => {
							await snapshotGen.generateGardenSnapshot(
								this.settings,
								publisher,
							);
						},
					});
				})
				.catch((e) => {
					Logger.error("Unable to load generateGardenSnapshot", e);
				});
		}

		this.addCommand({
			id: "publish-multiple-notes",
			name: "Publish All Notes Marked for Publish",
			// TODO: move to publisher?
			callback: async () => {
				if (this.isPublishing) {
					new Notice(
						"A publish operation is already in progress. Please wait for it to complete.",
					);

					return;
				}

				this.isPublishing = true;
				const statusBarItem = this.addStatusBarItem();

				try {
					new Notice("Processing files to publish...");
					const { vault, metadataCache } = this.app;

					const publisher = new Publisher(
						vault,
						metadataCache,
						this.settings,
					);
					publisher.validateSettings();

					const siteManager = new DigitalGardenSiteManager(
						metadataCache,
						this.settings,
					);

					const publishStatusManager = new PublishStatusManager(
						siteManager,
						publisher,
					);

					const publishStatus =
						await publishStatusManager.getPublishStatus();

					const filesToPublish = publishStatus.changedNotes.concat(
						publishStatus.unpublishedNotes,
					);
					const filesToDelete = publishStatus.deletedNotePaths;
					const imagesToDelete = publishStatus.deletedImagePaths;

					const totalItems =
						filesToPublish.length +
						filesToDelete.length +
						imagesToDelete.length;

					if (totalItems === 0) {
						new Notice("Garden is already fully synced!");
						statusBarItem.remove();
						this.isPublishing = false;

						return;
					}

					const statusBar = new PublishStatusBar(
						statusBarItem,
						filesToPublish.length +
							filesToDelete.length +
							imagesToDelete.length,
					);

					new Notice(
						`Publishing ${filesToPublish.length} notes, deleting ${filesToDelete.length} notes and ${imagesToDelete.length} images. See the status bar in lower right corner for progress.`,
						8000,
					);

					await publisher.publishBatch(filesToPublish);
					statusBar.incrementMultiple(filesToPublish.length);

					for (const file of filesToDelete) {
						await publisher.deleteNote(file.path);
						statusBar.increment();
					}

					for (const image of imagesToDelete) {
						await publisher.deleteImage(image.path);
						statusBar.increment();
					}

					statusBar.finish(8000);

					new Notice(
						`Successfully published ${filesToPublish.length} notes to your garden.`,
					);

					if (filesToDelete.length > 0) {
						new Notice(
							`Successfully deleted ${filesToDelete.length} notes from your garden.`,
						);
					}

					if (imagesToDelete.length > 0) {
						new Notice(
							`Successfully deleted ${imagesToDelete.length} images from your garden.`,
						);
					}

					this.isPublishing = false;
				} catch (e) {
					statusBarItem.remove();
					this.isPublishing = false;
					console.error(e);

					new Notice(
						"Unable to publish multiple notes, something went wrong.",
					);
				}
			},
		});

		this.addCommand({
			id: "copy-garden-url",
			name: "Copy Garden URL",
			callback: async () => {
				this.copyGardenUrlToClipboard();
			},
		});

		this.addCommand({
			id: "dg-open-publish-modal",
			name: "Open Publication Center",
			callback: async () => {
				this.openPublishModal();
			},
		});

		this.addCommand({
			id: "dg-mark-note-for-publish",
			name: "Add publish flag",
			callback: async () => {
				this.setPublishFlagValue(true);
			},
		});

		this.addCommand({
			id: "dg-unmark-note-for-publish",
			name: "Remove publish flag",
			callback: async () => {
				this.setPublishFlagValue(false);
			},
		});

		this.addCommand({
			id: "dg-mark-toggle-publish-status",
			name: "Toggle publication status",
			callback: async () => {
				this.togglePublishFlag();
			},
		});

		this.addCommand({
			id: "dg-set-as-home-page",
			name: "Set as Garden Home Page",
			callback: async () => {
				await this.setAsHomePage();
			},
		});
	}

	private getActiveFile(workspace: Workspace) {
		const activeFile = workspace.getActiveFile();

		if (!activeFile) {
			new Notice(
				"No file is open/active. Please open a file and try again.",
			);

			return null;
		}

		return activeFile;
	}

	async copyGardenUrlToClipboard() {
		try {
			const { metadataCache, workspace } = this.app;

			const activeFile = this.getActiveFile(workspace);

			if (!activeFile) {
				return;
			}

			const siteManager = new DigitalGardenSiteManager(
				metadataCache,
				this.settings,
			);
			const fullUrl = siteManager.getNoteUrl(activeFile);

			await navigator.clipboard.writeText(fullUrl);
			new Notice(`Note URL copied to clipboard`);
		} catch (e) {
			console.log(e);

			new Notice(
				"Unable to copy note URL to clipboard, something went wrong.",
			);
		}
	}

	// TODO: move to publisher?
	async publishSingleNote() {
		try {
			const { vault, workspace, metadataCache } = this.app;

			const activeFile = this.getActiveFile(workspace);

			if (!activeFile) {
				return;
			}

			if (activeFile.extension !== "md") {
				new Notice(
					"The current file is not a markdown file. Please open a markdown file and try again.",
				);

				return;
			}

			new Notice("Publishing note...");

			const publisher = new Publisher(
				vault,
				metadataCache,
				this.settings,
			);
			publisher.validateSettings();

			const publishFile = await new PublishFile({
				file: activeFile,
				vault: vault,
				compiler: publisher.compiler,
				metadataCache: metadataCache,
				settings: this.settings,
			}).compile();

			const publishSuccessful = await publisher.publish(publishFile);

			if (publishSuccessful) {
				new Notice(`Successfully published note to your garden.`);
			}

			return publishSuccessful;
		} catch (e) {
			console.error(e);
			new Notice("Unable to publish note, something went wrong.");

			return false;
		}
	}

	async setPublishFlagValue(value: boolean) {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		await this.app.fileManager.processFrontMatter(
			activeFile as TFile,
			(frontmatter) => {
				frontmatter[FRONTMATTER_KEYS.PUBLISH] = value;
			},
		);
	}
	async togglePublishFlag() {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		await this.app.fileManager.processFrontMatter(
			activeFile as TFile,
			(frontmatter) => {
				frontmatter[FRONTMATTER_KEYS.PUBLISH] =
					!frontmatter[FRONTMATTER_KEYS.PUBLISH];
			},
		);
	}

	async setAsHomePage() {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		// Check if current file already has dg-home: true
		const currentFileCache =
			this.app.metadataCache.getFileCache(activeFile);

		if (currentFileCache?.frontmatter?.[FRONTMATTER_KEYS.HOME]) {
			new Notice("This note is already set as the garden home page.");

			return;
		}

		// Find existing home pages
		const existingHomePages: TFile[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);

			if (cache?.frontmatter?.[FRONTMATTER_KEYS.HOME]) {
				existingHomePages.push(file);
			}
		}

		if (existingHomePages.length === 0) {
			// No existing home pages, just set this one
			await this.app.fileManager.processFrontMatter(
				activeFile as TFile,
				(frontmatter) => {
					frontmatter[FRONTMATTER_KEYS.HOME] = true;
					frontmatter[FRONTMATTER_KEYS.PUBLISH] = true;
				},
			);

			new Notice(
				`${activeFile.basename} is now your garden's home page and has been marked for publishing.`,
			);
		} else {
			// Show confirmation modal
			new HomePageConfirmationModal(
				this.app,
				activeFile,
				existingHomePages[0],
				async (shouldUpdate) => {
					if (shouldUpdate) {
						// Remove dg-home from existing page
						await this.app.fileManager.processFrontMatter(
							existingHomePages[0],
							(frontmatter) => {
								delete frontmatter[FRONTMATTER_KEYS.HOME];
							},
						);

						// Set dg-home on current page
						await this.app.fileManager.processFrontMatter(
							activeFile as TFile,
							(frontmatter) => {
								frontmatter[FRONTMATTER_KEYS.HOME] = true;
								frontmatter[FRONTMATTER_KEYS.PUBLISH] = true;
							},
						);

						new Notice(
							`${activeFile.basename} is now your garden's home page and has been marked for publishing.`,
						);
					}
				},
			).open();
		}
	}

	openPublishModal() {
		const siteManager = new DigitalGardenSiteManager(
			this.app.metadataCache,
			this.settings,
		);

		const publisher = new Publisher(
			this.app.vault,
			this.app.metadataCache,
			this.settings,
		);

		const publishStatusManager = new PublishStatusManager(
			siteManager,
			publisher,
		);

		this.publishModal = new PublicationCenter(
			this.app,
			publishStatusManager,
			publisher,
			siteManager,
			this.settings,
		);
		this.publishModal.open();
	}
}

class HomePageConfirmationModal extends Modal {
	private onConfirm: (confirmed: boolean) => void;
	private newHomeFile: TFile;
	private existingHomeFile: TFile;

	constructor(
		app: App,
		newHomeFile: TFile,
		existingHomeFile: TFile,
		onConfirm: (confirmed: boolean) => void,
	) {
		super(app);
		this.newHomeFile = newHomeFile;
		this.existingHomeFile = existingHomeFile;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Replace Garden Home Page?" });

		const messageDiv = contentEl.createDiv();

		messageDiv.createEl("p", {
			text: `${this.existingHomeFile.basename} is currently set as your garden home page.`,
		});

		messageDiv.createEl("p", {
			text: `This will remove the home page setting from ${this.existingHomeFile.basename} and set ${this.newHomeFile.basename} as the new home page.`,
		});

		const warningDiv = contentEl.createDiv({
			attr: {
				style: "margin: 20px 0; padding: 12px; background: var(--background-secondary); border-radius: 4px;",
			},
		});

		warningDiv.createEl("p", {
			text: "⚠️ Important: Both notes should be published from the Publication Center to ensure your garden has a proper home page.",
			attr: { style: "color: var(--text-warning); font-weight: bold;" },
		});

		const buttonContainer = contentEl.createDiv({
			attr: {
				style: "display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;",
			},
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			attr: {
				style: "padding: 8px 16px; border-radius: 4px; cursor: pointer;",
			},
		});

		cancelButton.onclick = () => {
			this.onConfirm(false);
			this.close();
		};

		const confirmButton = buttonContainer.createEl("button", {
			text: "Replace Home Page",
			attr: {
				style: "padding: 8px 16px; border-radius: 4px; cursor: pointer; background: var(--interactive-accent); color: var(--text-on-accent);",
			},
		});

		confirmButton.onclick = () => {
			this.onConfirm(true);
			this.close();
		};

		// Add keyboard support
		this.scope.register([], "Enter", () => {
			this.onConfirm(true);
			this.close();
		});

		this.scope.register([], "Escape", () => {
			this.onConfirm(false);
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
