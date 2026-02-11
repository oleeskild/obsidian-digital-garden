import { Notice, Plugin, Workspace, addIcon, TFile } from "obsidian";
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

const DEFAULT_SETTINGS: DigitalGardenSettings = {
	githubRepo: "",
	githubToken: "",
	githubUserName: "",
	contentBasePath: "src/content/",
	gardenBaseUrl: "",
	prHistory: [],
	baseTheme: "dark",
	theme: JSON.stringify({
		name: "Red Graphite",
		author: "SeanWcom",
		repo: "seanwcom/Red-Graphite-for-Obsidian",
		screenshot: "thumbnail.png",
		modes: ["dark", "light"],
		cssUrl: "https://raw.githubusercontent.com/seanwcom/Red-Graphite-for-Obsidian/HEAD/theme.css",
	}),
	faviconPath: "",
	logoPath: "",
	useFullResolutionImages: false,
	noteSettingsIsInitialized: false,
	siteName: "Digital Garden",
	mainLanguage: "en",
	slugifyEnabled: true,
	noteIconKey: "dg-note-icon",
	defaultNoteIcon: "",
	showNoteIconOnTitle: false,
	showNoteIconInFileTree: false,
	showNoteIconOnInternalLink: false,
	showNoteIconOnBackLink: false,
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
	autoDeploySettings: {
		enabled: false,
		workflowId: "",
		branch: "main",
		workflowInputs: {},
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
		canvasDragHint: "",
		canvasZoomHint: "",
		canvasResetHint: "",
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

		this.addRibbonIcon("digital-garden-icon", "打开发布中心", async () => {
			this.openPublishModal();
		});
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
		// 发布当前笔记
		this.addCommand({
			id: "publish-note",
			name: "发布当前笔记",
			callback: async () => {
				await this.publishSingleNote();
			},
		});

		// 批量发布所有标记的笔记
		this.addCommand({
			id: "publish-multiple-notes",
			name: "发布所有标记的笔记",
			callback: async () => {
				await this.publishMultipleNotes();
			},
		});

		// 打开发布中心
		this.addCommand({
			id: "dg-open-publish-modal",
			name: "打开发布中心",
			callback: async () => {
				this.openPublishModal();
			},
		});

		// 添加发布标记
		this.addCommand({
			id: "dg-mark-note-for-publish",
			name: "添加发布标记",
			callback: async () => {
				this.setPublishFlagValue(true);
			},
		});

		// 移除发布标记
		this.addCommand({
			id: "dg-unmark-note-for-publish",
			name: "移除发布标记",
			callback: async () => {
				this.setPublishFlagValue(false);
			},
		});
	}

	private getActiveFile(workspace: Workspace) {
		const activeFile = workspace.getActiveFile();

		if (!activeFile) {
			new Notice("没有打开的文件，请先打开一个文件。");

			return null;
		}

		return activeFile;
	}

	// 发布单篇笔记
	async publishSingleNote() {
		try {
			const { vault, workspace, metadataCache } = this.app;
			const activeFile = this.getActiveFile(workspace);

			if (!activeFile) {
				return;
			}

			if (
				activeFile.extension !== "md" &&
				activeFile.extension !== "canvas"
			) {
				new Notice("当前文件不是 Markdown 或 Canvas 文件，无法发布。");

				return;
			}

			new Notice("正在发布笔记...");

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
				new Notice("笔记发布成功！");

				// 触发自动部署
				if (this.settings.autoDeploySettings.enabled) {
					new Notice("正在触发部署...");
					const deploySuccess = await publisher.triggerDeployment();

					if (deploySuccess) {
						new Notice("部署触发成功！");
					} else {
						new Notice("部署触发失败，请检查设置。");
					}
				}
			}

			return publishSuccessful;
		} catch (e) {
			console.error(e);
			new Notice("发布失败，出现错误。");

			return false;
		}
	}

	// 批量发布笔记
	async publishMultipleNotes() {
		if (this.isPublishing) {
			new Notice("发布操作正在进行中，请等待完成。");

			return;
		}

		this.isPublishing = true;
		const statusBarItem = this.addStatusBarItem();

		try {
			new Notice("正在处理要发布的文件...");
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

			const publishStatus = await publishStatusManager.getPublishStatus();

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
				new Notice("所有内容已是最新状态！");
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
				`正在发布 ${filesToPublish.length} 篇笔记，删除 ${filesToDelete.length} 篇笔记和 ${imagesToDelete.length} 张图片...`,
				8000,
			);

			// 批量发布
			await publisher.publishBatch(filesToPublish);
			statusBar.incrementMultiple(filesToPublish.length);

			// 批量删除笔记（只触发一次部署）
			const notePathsToDelete = filesToDelete.map((f) => f.path);
			await publisher.deleteBatch(notePathsToDelete);
			statusBar.incrementMultiple(filesToDelete.length);

			// 批量删除图片（只触发一次部署）
			const imagePathsToDelete = imagesToDelete.map((i) => i.path);
			await publisher.deleteImageBatch(imagePathsToDelete);
			statusBar.incrementMultiple(imagesToDelete.length);

			statusBar.finish(8000);

			new Notice(`成功发布 ${filesToPublish.length} 篇笔记！`);

			if (filesToDelete.length > 0) {
				new Notice(`成功删除 ${filesToDelete.length} 篇笔记！`);
			}

			if (imagesToDelete.length > 0) {
				new Notice(`成功删除 ${imagesToDelete.length} 张图片！`);
			}

			// 触发自动部署
			if (this.settings.autoDeploySettings.enabled) {
				new Notice("正在触发部署...");
				const deploySuccess = await publisher.triggerDeployment();

				if (deploySuccess) {
					new Notice("部署触发成功！");
				} else {
					new Notice("部署触发失败，请检查设置。");
				}
			}

			this.isPublishing = false;
		} catch (e) {
			statusBarItem.remove();
			this.isPublishing = false;
			console.error(e);
			new Notice("发布失败，出现错误。");
		}
	}

	// 设置发布标记
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

		if (value) {
			new Notice(`已为 "${activeFile.basename}" 添加发布标记`);
		} else {
			new Notice(`已移除 "${activeFile.basename}" 的发布标记`);
		}
	}

	// 打开发布中心
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
