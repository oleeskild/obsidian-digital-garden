import { Notice, Platform, Plugin, Workspace, addIcon } from "obsidian";
import Publisher from "./src/publisher/Publisher";
import QuartzSyncerSettings from "./src/models/settings";
import { quartzSyncerIcon } from "./src/ui/suggest/constants";
import { PublicationCenter } from "src/views/PublicationCenter/PublicationCenter";
import PublishStatusManager from "src/publisher/PublishStatusManager";
import ObsidianFrontMatterEngine from "src/publishFile/ObsidianFrontMatterEngine";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import { QuartzSyncerSettingTab } from "./src/views/QuartzSyncerSettingTab";
import Logger from "js-logger";

const DEFAULT_SETTINGS: QuartzSyncerSettings = {
	githubRepo: "quartz",
	githubToken: "",
	githubUserName: "",
	useFullResolutionImages: false,
	noteSettingsIsInitialized: false,

	// Quartz related settings
	contentFolder: "content",
	vaultPath: "/",

	// Timestamp related settings
	showCreatedTimestamp: true,
	createdTimestampKey: "created",
	showUpdatedTimestamp: true,
	updatedTimestampKey: "modified",
	showPublishedTimestamp: false,
	publishedTimestampKey: "published",
	timestampFormat: "MMM dd, yyyy h:mm a",

	pathRewriteRules: "",

	usePermalink: false,

	useDataview: true,
	useExcalidraw: false,

	useThemes: false,

	includeAllFrontmatter: false,

	applyEmbeds: true,

	publishFrontmatterKey: "publish",

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

		await this.loadSettings();

		this.settings.logLevel && Logger.setLevel(this.settings.logLevel);

		Logger.info("Initializing QuartzSyncer plugin v" + this.appVersion);

		Logger.info("Quartz Syncer log level set to " + Logger.getLevel().name);
		this.addSettingTab(new QuartzSyncerSettingTab(this.app, this));

		await this.addCommands();

		addIcon("quartz-syncer-icon", quartzSyncerIcon);

		this.addRibbonIcon(
			"quartz-syncer-icon",
			"Quartz Syncer publication center",
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

		this.addCommand({
			id: "open-publish-modal",
			name: "Open publication center",
			callback: async () => {
				this.openPublishModal();
			},
		});

		this.addCommand({
			id: "mark-note-for-publish",
			name: "Add publication flag",
			callback: async () => {
				this.setPublishFlagValue(true);
			},
		});

		this.addCommand({
			id: "unmark-note-for-publish",
			name: "Remove publication flag",
			callback: async () => {
				this.setPublishFlagValue(false);
			},
		});

		this.addCommand({
			id: "mark-toggle-publish-status",
			name: "Toggle publication flag",
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
