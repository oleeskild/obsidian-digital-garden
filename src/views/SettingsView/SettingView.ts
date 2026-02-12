import {
	App,
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

		// 路径改写规则输入框
		new Setting(this.settingsRootElement)
			.setName("路径改写规则")
			.setDesc(
				"每行一条规则，格式：原始路径:目标路径。用于将本地文件夹结构映射到发布后的结构",
			)
			.addTextArea((text) => {
				text.setPlaceholder(
					"例如：1-projects/:blog/\nPath Rewriting/Subfolder2:fun-folder",
				)
					.setValue(this.settings.pathRewriteRules)
					.onChange(async (value) => {
						this.settings.pathRewriteRules = value;
						await this.saveSettings();
					});
				text.inputEl.rows = 5;
				text.inputEl.style.width = "100%";
			});

		// 路径改写示例说明
		const exampleContainer = this.settingsRootElement.createEl("div", {
			cls: "setting-item-description",
		});
		exampleContainer.style.marginTop = "10px";
		exampleContainer.style.marginBottom = "15px";
		exampleContainer.style.padding = "10px";
		exampleContainer.style.backgroundColor = "var(--background-secondary)";
		exampleContainer.style.borderRadius = "5px";

		exampleContainer.createEl("div", {
			text: "📋 路径改写示例（基于当前规则）：",
			cls: "setting-item-name",
		});

		const exampleList = exampleContainer.createEl("ul", {
			cls: "setting-item-description",
		});
		exampleList.style.marginTop = "8px";
		exampleList.style.marginLeft = "20px";

		const examples = [
			{
				from: "1-projects/blog/2023/weekly-01.md",
				to: "blog/2023/weekly-01.md",
			},
			{
				from: "1-projects/worknotes/2026/note.md",
				to: "worknotes/2026/note.md",
			},
			{
				from: "notes/PARA系统.md",
				to: "notes/PARA系统.md",
			},
		];

		for (const example of examples) {
			const li = exampleList.createEl("li");
			li.createEl("code", { text: example.from });
			li.createEl("span", { text: " → " });
			li.createEl("code", { text: example.to });
		}

		exampleContainer.createEl("div", {
			text: "💡 提示：使用冒号分隔原始路径和目标路径，留空目标路径表示映射到根目录",
			cls: "setting-item-description",
		}).style.marginTop = "8px";

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
}
