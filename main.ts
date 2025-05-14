import { Notice, Platform, Plugin, Workspace, addIcon } from "obsidian";
import Publisher from "./src/publisher/Publisher";
import QuartzSyncerSettings from "./src/models/settings";
import { quartzSyncerIcon } from "./src/ui/suggest/constants";
//import { PublishStatusBar } from "./src/views/PublishStatusBar";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import { QuartzSyncerSettingTab } from "./src/views/QuartzSyncerSettingTab";
import Logger from "js-logger";
import { PublishFile } from "./src/publishFile/PublishFile";

const DEFAULT_SETTINGS: QuartzSyncerSettings = {
	githubRepo: "",
	githubToken: "",
	githubUserName: "",
	prHistory: [],
	useFullResolutionImages: false,
	noteSettingsIsInitialized: false,
	siteName: "Quartz",
	slugifyEnabled: false,
	contentFolder: "content",
	vaultPath: "/",

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

	contentClassesKey: "content-classes",

	usePermalink: false,

	publishFrontmatterKey: "publish",

	defaultNoteSettings: {
		HomeLink: true,
		PassFrontmatter: true,
	},
	logLevel: undefined,
};

Logger.useDefaults({
	defaultLevel: Logger.WARN,
	formatter: function (messages, _context) {
		messages.unshift(new Date().toUTCString());
		messages.unshift("QS: ");
	},
});
export default class QuartzSyncer extends Plugin {
	settings!: QuartzSyncerSettings;
	appVersion!: string;

	publishModal!: PublicationCenter;

	async onload() {
		this.appVersion = this.manifest.version;

		console.log("Initializing QuartzSyncer plugin v" + this.appVersion);
		await this.loadSettings();

		this.settings.logLevel && Logger.setLevel(this.settings.logLevel);

		Logger.info("Quartz Syncer log level set to " + Logger.getLevel().name);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		await this.addCommands();

		addIcon("quartz-syncer-icon", quartzSyncerIcon);

		this.addRibbonIcon(
			"quartz-syncer-icon",
			"Quartz Syncer Publication Center",
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
		/*
		this.addCommand({
			id: "publish-note",
			name: "Publish Single Note",
			callback: async () => {
				await this.publishSingleNote();
			},
		});
		*/

		if (this.settings["ENABLE_DEVELOPER_TOOLS"] && Platform.isDesktop) {
			Logger.info("Developer tools enabled");

			const publisher = new Publisher(
				this.app.vault,
				this.app.metadataCache,
				this.settings,
			);

			import("./src/test/snapshot/generateSyncerSnapshot")
				.then((snapshotGen) => {
					this.addCommand({
						id: "generate-syncer-snapshot",
						name: "Generate Syncer Snapshot",
						callback: async () => {
							await snapshotGen.generateSyncerSnapshot(
								this.settings,
								publisher,
							);
						},
					});
				})
				.catch((e) => {
					Logger.error("Unable to load generateSyncerSnapshot", e);
				});
		}

		/*
		this.addCommand({
			id: "publish-multiple-notes",
			name: "Publish Multiple Notes",
			// TODO: move to publisher?
			callback: async () => {
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

					const siteManager = new QuartzSyncerSiteManager(
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
					const blobsToDelete = publishStatus.deletedBlobPaths;

					const totalItems =
						filesToPublish.length +
						filesToDelete.length +
						blobsToDelete.length;

					if (totalItems === 0) {
						new Notice("Syncer is already fully synced!");
						statusBarItem.remove();

						return;
					}

					const statusBar = new PublishStatusBar(
						statusBarItem,
						filesToPublish.length +
							filesToDelete.length +
							blobsToDelete.length,
					);

					new Notice(
						`Publishing ${filesToPublish.length} notes, deleting ${filesToDelete.length} notes and ${blobsToDelete.length} blobs. See the status bar in lower right corner for progress.`,
						8000,
					);

					await publisher.publishBatch(filesToPublish);
					statusBar.incrementMultiple(filesToPublish.length);

					for (const file of filesToDelete) {
						await publisher.deleteNote(file.path);
						statusBar.increment();
					}

					for (const blob of blobsToDelete) {
						await publisher.deleteBlob(blob.path);
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

					if (blobsToDelete.length > 0) {
						new Notice(
							`Successfully deleted ${blobsToDelete.length} blobs from your garden.`,
						);
					}
				} catch (e) {
					statusBarItem.remove();
					console.error(e);

					new Notice(
						"Unable to publish multiple notes, something went wrong.",
					);
				}
			},
		});
*/

		this.addCommand({
			id: "open-publish-modal",
			name: "Open Publication Center",
			callback: async () => {
				this.openPublishModal();
			},
		});

		this.addCommand({
			id: "mark-note-for-publish",
			name: "Add publish flag",
			callback: async () => {
				this.setPublishFlagValue(true);
			},
		});

		this.addCommand({
			id: "unmark-note-for-publish",
			name: "Remove publish flag",
			callback: async () => {
				this.setPublishFlagValue(false);
			},
		});

		this.addCommand({
			id: "mark-toggle-publish-status",
			name: "Toggle publication status",
			callback: async () => {
				this.togglePublishFlag();
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

		const engine = new ObsidianFrontMatterEngine(
			this.app.vault,
			this.app.metadataCache,
			activeFile,
		);
		engine.set(this.settings.publishFrontmatterKey, value).apply();
	}
	async togglePublishFlag() {
		const activeFile = this.getActiveFile(this.app.workspace);

		if (!activeFile) {
			return;
		}

		const engine = new ObsidianFrontMatterEngine(
			this.app.vault,
			this.app.metadataCache,
			activeFile,
		);

		engine
			.set(
				this.settings.publishFrontmatterKey,
				!engine.get(this.settings.publishFrontmatterKey),
			)
			.apply();
	}

	openPublishModal() {
		if (!this.publishModal) {
			const siteManager = new QuartzSyncerSiteManager(
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
		}
		this.publishModal.open();
	}
}
