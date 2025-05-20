import { App, debounce, getIcon, MetadataCache, Notice } from "obsidian";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "../../models/settings";
import { GithubSettings } from "./Views/GithubSettings";
import { QuartzSettings } from "./Views/QuartzSettings";
import { FrontmatterSettings } from "./Views/FrontmatterSettings";
import { IntegrationSettings } from "./Views/IntegrationSettings";

export default class SettingView {
	app: App;
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
		this.settingsRootElement.classList.add("quartz-syncer-settings");
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	getIcon(name: string): Node {
		return getIcon(name) ?? document.createElement("span");
	}

	async initialize() {
		this.settingsRootElement.empty();

		const title = this.settingsRootElement.createEl("div", {
			cls: "quartz-syncer-setting-title",
		});

		title.createEl("h1", {
			text: "Quartz Syncer",
		});

		const descriptionDiv = this.settingsRootElement.createEl("div", {
			cls: "quartz-syncer-settings-description",
		});

		descriptionDiv.createEl("span", {
			text: "Remember to read the ",
		});

		descriptionDiv.createEl("a", {
			text: "documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/",
		});

		descriptionDiv.createEl("span", {
			text: " if you haven't already. A ",
		});

		descriptionDiv.createEl("a", {
			text: "setup guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide",
		});

		descriptionDiv.createEl("span", {
			text: " and a ",
		});

		descriptionDiv.createEl("a", {
			text: "usage guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Usage-Guide",
		});

		descriptionDiv.createEl("span", {
			text: " are also available. If you encounter any issues, please see the ",
		});

		descriptionDiv.createEl("a", {
			text: "troubleshooting section",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/",
		});

		descriptionDiv.createEl("span", {
			text: " for help.",
		});

		const header = this.settingsRootElement.createEl("div", {
			cls: "quartz-syncer-setting-header",
		});

		const headerTabGroup = header.createEl("div", {
			cls: "quartz-syncer-setting-tab-group",
		});

		const githubTab = this.createTab("GitHub", "github");
		const quartzTab = this.createTab("Quartz", "quartz-syncer-icon");
		const frontmatterTab = this.createTab("Frontmatter", "archive");
		const integrationTab = this.createTab("Integration", "cable");

		headerTabGroup.appendChild(githubTab);
		headerTabGroup.appendChild(quartzTab);
		headerTabGroup.appendChild(frontmatterTab);
		headerTabGroup.appendChild(integrationTab);

		const content = this.settingsRootElement.createEl("div", {
			cls: "quartz-syncer-setting-content",
		});

		new GithubSettings(this, this.createSettingsTab(content, "GitHub"));
		new QuartzSettings(this, this.createSettingsTab(content, "Quartz"));

		new FrontmatterSettings(
			this,
			this.createSettingsTab(content, "Frontmatter"),
		);

		new IntegrationSettings(
			this,
			this.createSettingsTab(content, "Integration"),
		);

		const tabs = this.settingsRootElement.querySelectorAll(
			"[data-quartz-syncer-tab]",
		);

		tabs.forEach((tab) => {
			tab.addEventListener("click", () => {
				const tabName = tab.getAttribute("data-quartz-syncer-tab");

				if (tabName) {
					this.setActiveTab(tabName);
				}
			});
		});

		this.setActiveTab("github");
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

	private createTab(name: string, icon: string) {
		const tab = this.settingsRootElement.createEl("div", {
			cls: "quartz-syncer-navigation-item",
			attr: { "data-quartz-syncer-tab": name.toLowerCase() },
		});

		tab.createEl("span", {
			cls: "quartz-syncer-navigation-item-icon",
		}).appendChild(this.getIcon(icon));

		tab.createEl("span", {
			text: name,
			cls: "quartz-syncer-navigation-item-text",
		});

		return tab;
	}

	private createSettingsTab(parent: HTMLElement, name: string) {
		const tab = parent.createEl("div", {
			cls: "quartz-syncer-tab-settings",
		});

		tab.id = name.toLowerCase();

		return tab;
	}

	private setActiveTab(tabName: string) {
		const tabs = this.settingsRootElement.querySelectorAll(
			"[data-quartz-syncer-tab]",
		);

		tabs.forEach((tab) => {
			if (tab.getAttribute("data-quartz-syncer-tab") === tabName) {
				tab.addClass("quartz-syncer-navigation-item-active");
			} else {
				tab.removeClass("quartz-syncer-navigation-item-active");
			}
		});

		this.settingsRootElement
			.querySelectorAll(".quartz-syncer-tab-settings")
			.forEach((tabContent) => {
				if (tabContent.id === tabName) {
					tabContent.classList.add(
						"quartz-syncer-tab-settings-active",
					);
				} else {
					tabContent.classList.remove(
						"quartz-syncer-tab-settings-active",
					);
				}
			});
	}
}
