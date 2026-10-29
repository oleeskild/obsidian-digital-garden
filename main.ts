import {
	Notice,
	Platform,
	Plugin,
	Workspace,
	addIcon,
	setIcon,
	TFile,
	Modal,
	App,
} from "obsidian";
import Publisher from "./src/publisher/Publisher";
import DigitalGardenSettings from "./src/models/settings";
import { PublishStatusBar } from "./src/views/PublishStatusBar";
import { seedling } from "src/ui/suggest/constants";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import { DigitalGardenSettingTab } from "./src/views/DigitalGardenSettingTab";
import Logger from "js-logger";
import { PublishFile } from "./src/publishFile/PublishFile";
import { FRONTMATTER_KEYS } from "./src/publishFile/FileMetaDataManager";
import { InstallPluginModal } from "./src/views/GardenPluginSettings/InstallPluginModal";
import { PublishPlatform } from "src/models/PublishPlatform";
import { hasUpdates } from "./src/repositoryConnection/TemplateManager";
import { LimitReachedError } from "src/forestry/LimitReachedError";
import { notifyLimitReached } from "src/forestry/limitNotice";
import { PublishBranchMissingError } from "src/repositoryConnection/PublishBranchMissingError";
import { notifyPublishBranchMissing } from "src/repositoryConnection/publishBranchNotice";
import { LocalExporter } from "./src/localExport/LocalExporter";
import { PublicationCenterView } from "src/views/PublicationCenterView/PublicationCenterView";
import { VIEW_TYPE } from "src/views/PublicationCenterView/constants";
import { pullFromSite } from "src/views/PublicationCenterView/site/siteSync";
import type { CenterTarget } from "src/views/PublicationCenterView/site/target";
import { siteStatus } from "src/forestry/buildStatus";
import { WorkspaceLeaf } from "obsidian";
import ForestryApi from "src/forestry/ForestryApi";
import {
	appendDebugLogLine,
	getDebugLog,
	setDebugLogContext,
} from "src/utils/debugLog";
import { SiteUpdateTracker } from "src/forestry/SiteUpdateTracker";
import { connectWithCode } from "src/forestry/connectWithCode";
import { confirmConnect } from "src/views/ConnectConfirmModal";
import { findHomePageFiles } from "src/publishFile/homePage";
import { HomePagePickerModal } from "src/views/HomePage/HomePagePickerModal";
import { promptForHomePage } from "src/views/HomePage/HomePagePromptModal";

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
	logoHeight: "",
	useFullResolutionImages: false,
	noteSettingsIsInitialized: false,
	siteName: "Digital Garden",
	mainLanguage: "en",
	slugifyEnabled: true,
	excalidrawSvgExportEnabled: true,
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
		dgShowGraphDepthControl: false,
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
		searchNotStarted: "",
		searchEnterHotkey: "",
		searchEnterHint: "",
		searchNavigateHotkey: "",
		searchNavigateHint: "",
		searchCloseHotkey: "",
		searchCloseHint: "",
		searchNoResults: "",
		searchPreviewPlaceholder: "",
		canvasDragHint: "",
		canvasZoomHint: "",
		canvasResetHint: "",
	},

	logLevel: undefined,
	localExportPath: "",
	contentBaseDir: "",
};

Logger.useDefaults({
	defaultLevel: Logger.WARN,
	formatter: function (messages, _context) {
		messages.unshift(new Date().toUTCString());
		messages.unshift("DG: ");
	},
});

// Mirror every log line into the copyable in-memory buffer (snapshot the
// messages before the console formatter mutates them) while keeping the
// normal console output.
const consoleLogHandler = Logger.createDefaultHandler({
	formatter: function (messages, _context) {
		messages.unshift(new Date().toUTCString());
		messages.unshift("DG: ");
	},
});

Logger.setHandler((messages, context) => {
	appendDebugLogLine(context.level.name, Array.from(messages));
	consoleLogHandler(messages, context);
});
export default class DigitalGarden extends Plugin {
	settings!: DigitalGardenSettings;
	appVersion!: string;

	isPublishing: boolean = false;

	/** Tracks garden site updates; only set for Forestry.md-hosted gardens. */
	siteUpdateTracker: SiteUpdateTracker | null = null;
	private siteStatusBarItem: HTMLElement | null = null;
	private siteStatusUnsubscribe: (() => void) | null = null;
	private siteTrackerApiKey: string | null = null;

	/** The home-page prompt is shown at most once per Obsidian session. */
	private askedAboutHomePage = false;

	async onload() {
		this.appVersion = this.manifest.version;
		setDebugLogContext(`v${this.appVersion}`);

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
				this.activatePublicationCenter();
			},
		);

		this.registerView(
			VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new PublicationCenterView(leaf, this),
		);

		this.syncSiteUpdateTracker();
		this.registerDeepLinks();

		this.refreshForestryPageInfo();
		this.pullSiteSettings();
		this.checkForTemplateUpdates();
		this.registerDevAutoExport();
	}

	/**
	 * Re-fetch the garden's name and base URL from the Forestry API. Both are
	 * stored at connect time and go stale when the garden is renamed on the
	 * dashboard — the Garden Key keeps working, but copied note/garden URLs
	 * would point at the dead old subdomain. Fire-and-forget on startup;
	 * failures (offline, revoked key) leave the stored values untouched.
	 */
	private async refreshForestryPageInfo(): Promise<void> {
		const forestrySettings = this.settings.forestrySettings;

		if (
			this.settings.publishPlatform !== PublishPlatform.ForestryMd ||
			!forestrySettings.apiKey
		) {
			return;
		}

		const pageInfo = await new ForestryApi(
			forestrySettings.apiKey,
		).getPageInfo();

		if (!pageInfo?.value?.pageName || !pageInfo.value.baseUrl) {
			return;
		}

		if (
			forestrySettings.forestryPageName === pageInfo.value.pageName &&
			forestrySettings.baseUrl === pageInfo.value.baseUrl
		) {
			return;
		}

		Logger.info(
			`Garden info changed (${forestrySettings.baseUrl} -> ${pageInfo.value.baseUrl}); updating stored settings`,
		);
		forestrySettings.forestryPageName = pageInfo.value.pageName;
		forestrySettings.baseUrl = pageInfo.value.baseUrl;
		await this.saveSettings();
	}

	/**
	 * Create or tear down the site-update tracker and its status bar item so
	 * they match the current settings. Called on load and after every
	 * settings save, so switching publish platform (or changing the API key)
	 * takes effect immediately.
	 */
	syncSiteUpdateTracker() {
		const apiKey = this.settings.forestrySettings.apiKey;

		const enabled =
			this.settings.publishPlatform === PublishPlatform.ForestryMd &&
			!!apiKey;

		if (
			enabled &&
			this.siteUpdateTracker &&
			this.siteTrackerApiKey === apiKey
		) {
			return;
		}

		this.teardownSiteUpdateTracker();

		if (enabled) {
			this.createSiteUpdateTracker(apiKey);
		}

		// Open Publication Centers hold the old tracker (or none) as a prop;
		// remount them so the publish-status strip appears/disappears.
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof PublicationCenterView) {
				leaf.view.remountComponent();
			}
		}
	}

	private teardownSiteUpdateTracker() {
		this.siteStatusUnsubscribe?.();
		this.siteStatusUnsubscribe = null;
		this.siteStatusBarItem?.remove();
		this.siteStatusBarItem = null;
		this.siteUpdateTracker?.dispose();
		this.siteUpdateTracker = null;
		this.siteTrackerApiKey = null;
	}

	/**
	 * For Forestry.md gardens: start the plugin-wide site-update tracker and
	 * mirror its state into a persistent status bar item, so publishes from
	 * any command report whether the site actually went live.
	 */
	private createSiteUpdateTracker(apiKey: string) {
		this.siteUpdateTracker = new SiteUpdateTracker(new ForestryApi(apiKey));

		this.siteUpdateTracker.onChooseHomePage = () =>
			this.openHomePagePicker();

		this.siteUpdateTracker.siteUrl = () =>
			this.settings.forestrySettings.baseUrl || null;

		this.siteUpdateTracker.onOpenPublishes = () =>
			void this.openPublishes();
		this.siteTrackerApiKey = apiKey;

		const statusBarItem = this.addStatusBarItem();
		statusBarItem.addClass("dg-site-status", "mod-clickable");
		statusBarItem.setAttribute("role", "button");
		statusBarItem.setAttribute("tabindex", "0");
		statusBarItem.setAttribute("data-tooltip-position", "top");

		const iconEl = statusBarItem.createSpan({ cls: "dg-site-status-icon" });
		setIcon(iconEl, "sprout");
		const textEl = statusBarItem.createSpan();

		const open = () => void this.openPublishes();
		statusBarItem.onClickEvent(open);

		statusBarItem.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				open();
			}
		});

		this.siteStatusUnsubscribe = this.siteUpdateTracker.store.subscribe(
			(state) => {
				// Quiet when idle; otherwise the dashboard header's words.
				const status =
					state.phase === "idle" ? null : siteStatus(state.builds);

				const label =
					state.phase === "queued"
						? "Queued"
						: state.phase === "updating"
						? "Building"
						: status?.label ?? "";

				statusBarItem.toggleClass(
					"dg-site-status-updating",
					state.phase === "queued" || state.phase === "updating",
				);

				statusBarItem.toggleClass(
					"dg-site-status-failed",
					status?.tone === "destructive",
				);

				statusBarItem.toggleClass(
					"dg-site-status-warning",
					status?.tone === "warning",
				);
				textEl.setText(label);

				statusBarItem.setAttribute(
					"aria-label",
					`Forestry.md site${
						label ? `: ${label}` : ""
					}. Open publishes in the Publication Center.`,
				);
			},
		);
		this.siteStatusBarItem = statusBarItem;
	}

	/**
	 * The site is the source of truth for its settings, which can also be
	 * changed from another device, the dashboard or GitHub. Pull them in on
	 * startup. Fire-and-forget; failures leave the local values untouched.
	 */
	private async pullSiteSettings() {
		const connected =
			this.settings.publishPlatform === PublishPlatform.ForestryMd
				? !!this.settings.forestrySettings.apiKey
				: !!(
						this.settings.githubRepo &&
						this.settings.githubUserName &&
						this.settings.githubToken
				  );

		if (!connected) return;

		try {
			const siteManager = new DigitalGardenSiteManager(
				this.app.metadataCache,
				this.settings,
			);

			if (await pullFromSite(siteManager, this.settings)) {
				await this.saveSettings();
			}
		} catch (e) {
			Logger.warn("Couldn't read site settings on startup", e);
		}
	}

	private async checkForTemplateUpdates() {
		if (this.settings.publishPlatform !== PublishPlatform.SelfHosted) {
			return;
		}

		if (this.settings.disableTemplateUpdateNotice) {
			return;
		}

		try {
			const siteManager = new DigitalGardenSiteManager(
				this.app.metadataCache,
				this.settings,
			);

			const updater = await (
				await siteManager.getTemplateUpdater()
			).checkForUpdates();

			if (hasUpdates(updater)) {
				new Notice(
					`Digital Garden: A new site template version (${updater.newestTemplateVersion}) is available. Update in the plugin settings.`,
					10000,
				);
			}
		} catch {
			// Silently ignore update check failures on startup
		}
	}

	onunload() {
		this.teardownSiteUpdateTracker();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.syncSiteUpdateTracker();
	}

	async addCommands() {
		this.addCommand({
			id: "copy-debug-log",
			name: "Copy debug log",
			callback: async () => {
				await navigator.clipboard.writeText(getDebugLog());

				new Notice(
					"Debug log copied to clipboard. Paste it in the Discord if you need help.",
				);
			},
		});

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

		this.addCommand({
			id: "install-garden-plugin",
			name: "Install garden plugin from URL",
			callback: async () => {
				const modal = new InstallPluginModal(
					this.app,
					this.settings,
					() => this.saveSettings(),
					() => this.siteUpdateTracker?.notifyPublished(),
				);
				await modal.open();
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

					// Stop before compiling every note: the publish would
					// fail on the missing branch anyway. The catch below
					// cleans up and shows the notice.
					const branchStatus = await (
						await siteManager.getUserGardenConnection()
					).getPublishBranchStatus();

					if (branchStatus && !branchStatus.exists) {
						throw new PublishBranchMissingError(
							branchStatus.branch,
						);
					}

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

					const batchResult =
						await publisher.publishBatch(filesToPublish);

					if (!batchResult.success) {
						new Notice(
							`Publishing failed: ${
								batchResult.error ?? "unknown error"
							}\n\nRun "Copy debug log" from the command palette to share details when asking for help.`,
							0,
						);
					}
					statusBar.incrementMultiple(filesToPublish.length);

					// One commit for all deletions rather than one per file:
					// each commit triggers a site build and, on Forestry,
					// costs a publish.
					const deleteResult = await publisher.deleteBatch(
						filesToDelete.map((file) => file.path),
						imagesToDelete.map((image) => image.path),
					);

					if (!deleteResult.success) {
						new Notice(
							`Deleting failed: ${
								deleteResult.error ?? "unknown error"
							}\n\nRun "Copy debug log" from the command palette to share details when asking for help.`,
							0,
						);
					}

					statusBar.incrementMultiple(
						filesToDelete.length + imagesToDelete.length,
					);

					statusBar.finish(8000);
					this.siteUpdateTracker?.notifyPublished();

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

					if (e instanceof LimitReachedError) {
						this.showLimitNotice(e);

						return;
					}

					if (e instanceof PublishBranchMissingError) {
						notifyPublishBranchMissing(e);

						return;
					}
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
				this.activatePublicationCenter();
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

		this.addCommand({
			id: "dg-choose-home-page",
			name: "Choose Garden Home Page",
			callback: () => {
				this.openHomePagePicker();
			},
		});

		// Phones have no status bar, so publishes need a command of their own.
		this.addCommand({
			id: "open-publishes",
			name: "Open publishes",
			callback: () => void this.openPublishes(),
		});

		this.addCommand({
			id: "dg-reorder-navigation",
			name: "Reorder navigation",
			callback: async () => {
				await this.activatePublicationCenter({
					tab: "site",
					section: "navigation",
				});
			},
		});

		if (Platform.isDesktop) {
			this.addCommand({
				id: "export-garden-to-local-folder",
				name: "Export Garden to Local Folder",
				callback: async () => {
					await this.runLocalExport();
				},
			});
		}
	}

	private async runLocalExport() {
		try {
			new Notice("Exporting garden to local folder...");
			const { vault, metadataCache } = this.app;

			const publisher = new Publisher(
				vault,
				metadataCache,
				this.settings,
			);

			const exporter = new LocalExporter(vault, publisher, this.settings);

			const result = await exporter.export();

			if (result.failed > 0) {
				new Notice(
					`Exported ${result.notes} notes and ${result.images} images (${result.failed} failed). Check console for details.`,
					8000,
				);
			} else {
				new Notice(
					`Exported ${result.notes} notes and ${result.images} images to ${this.settings.localExportPath}`,
					8000,
				);
			}
		} catch (e) {
			// Validation errors already show Notices
			Logger.error("Local export failed", e);
		}
	}

	private registerDevAutoExport() {
		if (
			!Platform.isDesktop ||
			!this.settings.ENABLE_DEVELOPER_TOOLS ||
			!this.settings.localExportOnLoad ||
			!this.settings.localExportPath
		) {
			return;
		}

		this.app.workspace.onLayoutReady(() => {
			// Let the metadata cache and plugins like Dataview settle first
			window.setTimeout(() => {
				this.runLocalExport();
			}, 2000);
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
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		if (
			activeFile.extension !== "md" &&
			activeFile.extension !== "canvas"
		) {
			new Notice(
				"The current file is not a markdown or canvas file. Please open a supported file and try again.",
			);

			return;
		}

		if (!(await this.maybeOfferAsHomePage(activeFile))) {
			return false;
		}

		return this.publishNote(activeFile);
	}

	private isForestryGarden(): boolean {
		return (
			this.settings.publishPlatform === PublishPlatform.ForestryMd &&
			!!this.settings.forestrySettings.apiKey
		);
	}

	/**
	 * Before publishing a single note to a Forestry garden that has no home
	 * page, offer to make this note the home page. Resolves false when the
	 * user backed out and nothing should be published.
	 */
	private async maybeOfferAsHomePage(file: TFile): Promise<boolean> {
		if (
			!this.isForestryGarden() ||
			file.extension !== "md" ||
			this.settings.dontAskAboutHomePage ||
			this.askedAboutHomePage ||
			findHomePageFiles(this.app).length > 0
		) {
			return true;
		}

		this.askedAboutHomePage = true;
		const result = await promptForHomePage(this.app, file);

		if (result.dontAskAgain) {
			this.settings.dontAskAboutHomePage = true;
			await this.saveSettings();
		}

		if (result.choice === "cancel") {
			return false;
		}

		if (result.choice === "make-home") {
			await this.setHomePage(file);
			await this.waitForHomeFlag(file);
		}

		return true;
	}

	/**
	 * processFrontMatter writes the file; the metadata cache (which the
	 * compiler reads) catches up asynchronously. Wait briefly for dg-home to
	 * show up so the note is published as the home page, not a plain note.
	 */
	private async waitForHomeFlag(file: TFile, timeoutMs = 3000) {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const cache = this.app.metadataCache.getFileCache(file);

			if (cache?.frontmatter?.[FRONTMATTER_KEYS.HOME]) {
				return;
			}
			await new Promise((r) => window.setTimeout(r, 100));
		}
	}

	async publishNote(file: TFile) {
		try {
			const { vault, metadataCache } = this.app;

			new Notice("Publishing note...");

			const publisher = new Publisher(
				vault,
				metadataCache,
				this.settings,
			);
			publisher.validateSettings();

			const publishFile = await new PublishFile({
				file,
				vault: vault,
				compiler: publisher.compiler,
				metadataCache: metadataCache,
				settings: this.settings,
			}).compile();

			const publishSuccessful = await publisher.publish(publishFile);

			if (publishSuccessful) {
				new Notice(`Successfully published note to your garden.`);
				this.siteUpdateTracker?.notifyPublished();
			} else {
				new Notice("Unable to publish note, something went wrong.");
			}

			return publishSuccessful;
		} catch (e) {
			if (e instanceof LimitReachedError) {
				this.showLimitNotice(e);

				return false;
			}

			if (e instanceof PublishBranchMissingError) {
				notifyPublishBranchMissing(e);

				return false;
			}
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

		await this.setHomePage(activeFile);
	}

	/**
	 * Flag `file` as the garden home page (dg-home + dg-publish). If another
	 * note already is, ask before moving the flag. Resolves true when `file`
	 * ended up as the home page.
	 */
	async setHomePage(file: TFile): Promise<boolean> {
		const currentFileCache = this.app.metadataCache.getFileCache(file);

		if (currentFileCache?.frontmatter?.[FRONTMATTER_KEYS.HOME]) {
			new Notice("This note is already set as the garden home page.");

			return true;
		}

		const existingHomePages = findHomePageFiles(this.app).filter(
			(f) => f.path !== file.path,
		);

		const markAsHome = async () => {
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter) => {
					frontmatter[FRONTMATTER_KEYS.HOME] = true;
					frontmatter[FRONTMATTER_KEYS.PUBLISH] = true;
				},
			);

			new Notice(
				`${file.basename} is now your garden's home page and has been marked for publishing.`,
			);
		};

		if (existingHomePages.length === 0) {
			await markAsHome();

			return true;
		}

		return new Promise<boolean>((resolve) => {
			new HomePageConfirmationModal(
				this.app,
				file,
				existingHomePages[0],
				async (shouldUpdate) => {
					if (!shouldUpdate) {
						resolve(false);

						return;
					}

					for (const existing of existingHomePages) {
						await this.app.fileManager.processFrontMatter(
							existing,
							(frontmatter) => {
								delete frontmatter[FRONTMATTER_KEYS.HOME];
							},
						);
					}

					await markAsHome();
					resolve(true);
				},
			).open();
		});
	}

	/**
	 * Let the user pick the garden's home page from the vault. On Forestry
	 * gardens the chosen note is published right away so the site root
	 * stops being empty.
	 */
	openHomePagePicker() {
		new HomePagePickerModal(this.app, async (file) => {
			const isHome = await this.setHomePage(file);

			if (!isHome || !this.isForestryGarden()) {
				return;
			}

			await this.waitForHomeFlag(file);
			await this.publishNote(file);
		}).open();
	}

	/**
	 * Called right after a garden is connected to Forestry.md from the
	 * settings tab (Garden Key). Deep link connects do not call this, so they
	 * never lead straight into publishing. The new garden has no home page yet
	 * whatever the vault holds, so always offer to pick one. A note that is
	 * already flagged dg-home (from an earlier garden) is listed first;
	 * choosing it just publishes it to the new garden.
	 */
	afterForestryConnected() {
		this.openHomePagePicker();
	}

	/**
	 * `obsidian://digital-garden?...` deep links, used by the Forestry.md
	 * dashboard:
	 * - `connect=<code>`: connect; the code is exchanged for the garden key
	 *   server-side, then the user confirms this vault before settings change.
	 * - `open=home-picker`: open the home page picker.
	 * - `open=plugins[&plugin=<id>]`: open Garden Plugins on Browse & install,
	 *   with that community plugin selected. Used by the forestry.md gallery.
	 * Unknown parameters (e.g. the legacy `code`/`state` pair) are ignored.
	 */
	private registerDeepLinks() {
		this.registerObsidianProtocolHandler("digital-garden", (params) => {
			if (typeof params.connect === "string" && params.connect) {
				void this.handleConnectDeepLink(params.connect);

				return;
			}

			// Obsidian overwrites `action` with the handler name, so the
			// dashboard's home page link uses `open=home-picker` instead.
			if (params.open === "home-picker") {
				this.openHomePagePicker();

				return;
			}

			if (params.open === "plugins") {
				void this.openGardenPlugins(
					typeof params.plugin === "string" && params.plugin
						? params.plugin
						: undefined,
				);

				return;
			}

			Logger.info("Ignoring digital-garden deep link", params);
		});
	}

	private isGardenConnected(): boolean {
		if (this.settings.publishPlatform === PublishPlatform.ForestryMd) {
			return !!this.settings.forestrySettings.apiKey;
		}

		return (
			!!this.settings.githubRepo &&
			!!this.settings.githubUserName &&
			!!this.settings.githubToken
		);
	}

	/**
	 * Garden Plugins, on the Publication Center's Site tab. From a plugin
	 * link it opens on Browse & install with that plugin selected.
	 */
	async openGardenPlugins(pluginId?: string) {
		if (!this.isGardenConnected()) {
			new Notice(
				"Connect a garden first: open Settings → Digital Garden and connect it to Forestry.md or your GitHub repo. Then try again.",
				10000,
			);

			return;
		}

		await this.activatePublicationCenter({
			tab: "site",
			section: "plugins",
			pluginId,
		});
	}

	/**
	 * Deep link connect. Whichever vault is open receives the link, so the
	 * user confirms this vault before any setting changes, and connecting
	 * never publishes or opens the home page picker.
	 */
	private async handleConnectDeepLink(code: string) {
		new Notice("Checking connect link from Forestry.md…");

		await connectWithCode(code, {
			vaultName: this.app.vault.getName(),
			settings: this.settings,
			exchange: (c) => ForestryApi.exchangeConnectCode(c),
			confirm: (details) => confirmConnect(this.app, details),
			// saveSettings also (re)creates the site update tracker for the new key.
			saveSettings: () => this.saveSettings(),
			reportVault: (apiKey, vaultName) =>
				new ForestryApi(apiKey).confirmConnectedVault(vaultName),
			notify: (message, timeout) => {
				new Notice(message, timeout);
			},
			logError: (message, error) => Logger.error(message, error),
		});
	}

	private showLimitNotice(error: LimitReachedError) {
		notifyLimitReached(error);
	}

	/** The Publication Center with the publish history open. */
	private async openPublishes() {
		await this.activatePublicationCenter();
		this.siteUpdateTracker?.requestHistory();
	}

	async activatePublicationCenter(target?: CenterTarget) {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];

		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}

		workspace.revealLeaf(leaf);

		// If the view was already open, refresh it so it reflects any changes
		// made since it was last viewed.
		if (leaf.view instanceof PublicationCenterView) {
			leaf.view.maybeRefresh();

			if (target) leaf.view.show(target);
		}
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
