import {
	App,
	ButtonComponent,
	debounce,
	getIcon,
	MetadataCache,
	Modal,
	Notice,
	Setting,
} from "obsidian";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

import QuartzSyncerSettings from "../../models/settings";
import { GithubSettings } from "./GithubSettings";
import {
	hasUpdates,
	TemplateUpdater,
} from "../../repositoryConnection/TemplateManager";
import Logger from "js-logger";

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
		this.settingsRootElement.classList.add("settings");
		this.settings = settings;
		this.saveSettings = saveSettings;
	}

	getIcon(name: string): Node {
		return getIcon(name) ?? document.createElement("span");
	}

	async initialize() {
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
			href: "https://github.com/saberzero1/quartz-syncer",
		});

		const githubSettings = this.settingsRootElement.createEl("div", {
			cls: "connection-status",
		});

		new GithubSettings(this, githubSettings);
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
