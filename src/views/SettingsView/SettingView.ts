import {
	App,
	ButtonComponent,
	debounce,
	getIcon,
	MetadataCache,
	Modal,
	Setting,
} from "obsidian";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../../models/settings";
import { GithubSettings } from "./GithubSettings";
import RewriteSettings from "./RewriteSettings.svelte";
import {
	hasUpdates,
	TemplateUpdater,
} from "../../repositoryConnection/TemplateManager";
import Logger from "js-logger";
import { PublishPlatform } from "src/models/PublishPlatform";

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
			text: "数字花园发布设置",
		});

		const linkDiv = this.settingsRootElement.createEl("div", {
			attr: { style: "margin-bottom: 10px;" },
		});

		linkDiv.createEl("span", {
			text: "通过发布中心管理您的笔记发布状态，支持批量发布和路径改写。",
		});

		// 发布平台选择
		new Setting(this.settingsRootElement)
			.setName("发布平台")
			.setDesc("选择内容发布的目标平台")
			.addDropdown((dd) => {
				dd.addOption(PublishPlatform.SelfHosted, "GitHub 仓库");
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

		// 路径改写设置
		this.settingsRootElement
			.createEl("h3", { text: "路径改写" })
			.prepend(this.getIcon("git-compare"));

		new Setting(this.settingsRootElement)
			.setName("路径改写规则")
			.setDesc(
				"定义发布时笔记文件夹结构的重写规则。例如：将 'folder1/note.md' 重写到 'folder2/note.md'",
			)
			.addButton((cb) => {
				cb.setButtonText("管理路径改写规则");

				cb.onClick(() => {
					this.openPathRewriteRulesModal();
				});
			});

		// 调试日志
		this.settingsRootElement
			.createEl("h3", { text: "高级" })
			.prepend(this.getIcon("cog"));

		new Setting(this.settingsRootElement)
			.setName("启用调试日志")
			.setDesc("在开发者控制台显示详细日志，用于排查问题")
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.logLevel === Logger.DEBUG)
					.onChange(async (value) => {
						this.settings.logLevel = value
							? Logger.DEBUG
							: undefined;
						Logger.setLevel(value ? Logger.DEBUG : Logger.WARN);
						await this.saveSettings();
					});
			});

		prModal.titleEl.createEl("h1", "站点模板设置");
	}

	private initializePublishPlatformSettings(target: HTMLElement) {
		target.empty();

		if (this.settings.publishPlatform === PublishPlatform.SelfHosted) {
			new GithubSettings(this, target);
		} else {
			//  Forestry.md 设置简化版
			target.createEl("div", {
				text: "Forestry.md 设置",
				cls: "setting-item-name",
			});
		}
	}

	private openPathRewriteRulesModal() {
		const modal = new Modal(this.app);
		modal.titleEl.createEl("h2", { text: "路径改写规则" });

		const description = modal.contentEl.createEl("p");

		description.innerHTML = `
			<p>定义发布时笔记路径的改写规则。每行一条规则，格式为：</p>
			<code>源路径:目标路径</code>
			<p>例如：<code>notes:content</code> 会将所有 <code>notes/</code> 下的文件发布到 <code>content/</code> 下</p>
		`;

		new RewriteSettings({
			target: modal.contentEl,
			props: {
				settings: this.settings,
				saveSettings: this.saveSettings,
			},
		});

		new Setting(modal.contentEl).addButton((btn) =>
			btn
				.setButtonText("关闭")
				.setCta()
				.onClick(() => modal.close()),
		);

		modal.open();
	}

	async saveSiteSettingsAndUpdateEnv(
		metadataCache: MetadataCache,
		settings: DigitalGardenSettings,
		saveSettings: () => Promise<void>,
	) {
		const siteManager = new DigitalGardenSiteManager(
			metadataCache,
			settings,
		);
		await siteManager.updateEnv();
		await saveSettings();
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
			.createEl("h3", { text: "更新站点模板" })
			.prepend(getIcon("sync") ?? "");

		Logger.time("checkForUpdate");

		const updater = await (
			await siteManager.getTemplateUpdater()
		).checkForUpdates();
		Logger.timeEnd("checkForUpdate");

		const updateAvailable = hasUpdates(updater);

		new Setting(this.settingsRootElement)
			.setName("站点模板")
			.setDesc(
				"管理基础模板的更新。更新插件后建议更新模板以获得最新功能。",
			)
			.addButton(async (button) => {
				button.setButtonText(`检查中...`);
				Logger.time("checkForUpdate");

				if (updateAvailable) {
					button.setButtonText(
						`更新到 ${updater.newestTemplateVersion}`,
					);
					button.setCta();
				} else {
					button.setButtonText("已是最新版本");
					button.setDisabled(true);
				}

				button.onClick(() => {
					modal.open();
				});
			});

		modal.titleEl.empty();

		const titleContainer = modal.titleEl.createDiv({
			cls: "dg-modal-title",
		});
		const syncIcon = getIcon("refresh-cw");

		if (syncIcon) {
			titleContainer.appendChild(syncIcon);
		}
		titleContainer.createSpan({ text: "更新站点模板" });

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
			text: "这将创建一个包含最新模板更改的拉取请求。在您批准 PR 之前，您的站点不会更新。",
		});

		const buttonContainer = updateSection.createDiv({
			cls: "dg-update-button-container",
		});

		const createPrButton = buttonContainer.createEl("button", {
			text: "创建拉取请求",
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

		header.createSpan({ text: "最近的拉取请求" });

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

			const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
			const displayText = prNumber ? `拉取请求 #${prNumber}` : prUrl;

			prItem.createEl("a", {
				text: displayText,
				href: prUrl,
				cls: "dg-pr-history-link",
			});
		});
	}
}
