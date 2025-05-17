import { App, debounce, getIcon, MetadataCache, Notice } from "obsidian";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";

import QuartzSyncerSettings from "../../models/settings";
import { GithubSettings } from "./GithubSettings";

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

		this.settingsRootElement.createEl("h1", {
			text: "Quartz Syncer Settings",
		});

		const linkDiv = this.settingsRootElement.createEl("div", {
			attr: { style: "margin-bottom: 10px;" },
		});

		linkDiv.createEl("span", {
			text: "Remember to read the ",
		});

		linkDiv.createEl("a", {
			text: "documentation",
			href: "https://saberzero1.github.io/quartz-syncer-docs/",
		});

		linkDiv.createEl("span", {
			text: " if you haven't already. A ",
		});

		linkDiv.createEl("a", {
			text: "setup guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Setup-Guide",
		});

		linkDiv.createEl("span", {
			text: " and a ",
		});

		linkDiv.createEl("a", {
			text: "usage guide",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Usage-Guide",
		});

		linkDiv.createEl("span", {
			text: " are also available. If you encounter any issues, please see the ",
		});

		linkDiv.createEl("a", {
			text: "troubleshooting section",
			href: "https://saberzero1.github.io/quartz-syncer-docs/Troubleshooting/",
		});

		linkDiv.createEl("span", {
			text: " for help.",
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
}
