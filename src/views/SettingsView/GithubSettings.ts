import { Setting, debounce } from "obsidian";
import SettingView from "./SettingView";
import { Octokit } from "@octokit/core";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.id = "github-settings";
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ cls: "connection-status" },
		);
		this.initializeHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeGitHubContentFolder();
		this.initializeUseFullImageResolutionSetting();
		this.initializeShowCreatedTimestampSetting();
		this.initializeShowUpdatedTimestampSetting();
		this.initializePassFrontmatterSetting();
		this.initializeUsePermalinkSetting();
	}

	initializeHeader = () => {
		this.connectionStatusElement.style.cssText = "margin-left: 10px;";
		this.checkConnectionAndSaveSettings();

		const githubSettingsHeader = createEl("h3", {
			text: "GitHub Authentication (required)",
		});
		githubSettingsHeader.append(this.connectionStatusElement);
		githubSettingsHeader.prepend(this.settings.getIcon("github"));

		this.settingsRootElement.prepend(githubSettingsHeader);
	};

	checkConnectionAndSaveSettings = async () => {
		this.settings.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	updateConnectionStatus = async () => {
		const oktokit = new Octokit({
			auth: this.settings.settings.githubToken,
		});

		try {
			const response = await oktokit.request(
				"GET /repos/{owner}/{repo}",
				{
					owner: this.settings.settings.githubUserName,
					repo: this.settings.settings.githubRepo,
				},
			);

			// If other permissions are needed, add them here and indicate to user on insufficient permissions
			// Github now advocates for hyper-specific tokens
			if (response.data.permissions?.admin) {
				this.connectionStatus = "connected";
			}
		} catch (error) {
			this.connectionStatus = "error";
		}
		this.updateConnectionStatusIndicator();
	};

	debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	updateConnectionStatusIndicator = () => {
		if (this.connectionStatus === "loading") {
			this.connectionStatusElement.innerText = "⏳";
		}

		if (this.connectionStatus === "connected") {
			this.connectionStatusElement.innerText = "✅";
		}

		if (this.connectionStatus === "error") {
			this.connectionStatusElement.innerText = "❌";
		}
	};

	private initializeUseFullImageResolutionSetting() {
		new Setting(this.settingsRootElement)
			.setName("Use full image resolution")
			.setDesc(
				"By default, Quartz Syncer will use a lower resolution image to save space. If you want to use the full resolution image, enable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useFullResolutionImages)
					.onChange(async (value) => {
						this.settings.settings.useFullResolutionImages = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeShowCreatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Show created timestamp")
			.setDesc("Show the created timestamp on your notes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showCreatedTimestamp)
					.onChange(async (value) => {
						this.settings.settings.showCreatedTimestamp = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeShowUpdatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Show updated timestamp")
			.setDesc("Show the updated timestamp on your notes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showUpdatedTimestamp)
					.onChange(async (value) => {
						this.settings.settings.showUpdatedTimestamp = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializePassFrontmatterSetting() {
		new Setting(this.settingsRootElement)
			.setName("Pass frontmatter")
			.setDesc(
				"Pass the frontmatter from the notes to Quartz. This will allow you to use frontmatter in your Quartz notes.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.defaultNoteSettings
							.PassFrontmatter,
					)
					.onChange(async (value) => {
						this.settings.settings.defaultNoteSettings.PassFrontmatter =
							value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeUsePermalinkSetting() {
		new Setting(this.settingsRootElement)
			.setName("Use Permalink")
			.setDesc(
				"Use the note's permalink as the Quartz note's URL. This will override the default Quartz URL.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.usePermalink)
					.onChange(async (value) => {
						this.settings.settings.usePermalink = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubContentFolder() {
		new Setting(this.settingsRootElement)
			.setName("Quartz content folder name")
			.setDesc(
				'The folder where your vault lives inside Quartz. By default "content"',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.settings.settings.contentFolder)
					.onChange(async (value) => {
						this.settings.settings.contentFolder = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubRepoSetting() {
		new Setting(this.settingsRootElement)
			.setName("GitHub repo name")
			.setDesc("The name of the GitHub repository")
			.addText((text) =>
				text
					.setPlaceholder("myquartzsyncer")
					.setValue(this.settings.settings.githubRepo)
					.onChange(async (value) => {
						this.settings.settings.githubRepo = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubUserNameSetting() {
		new Setting(this.settingsRootElement)
			.setName("GitHub Username")
			.setDesc("Your GitHub Username")
			.addText((text) =>
				text
					.setPlaceholder("myusername")
					.setValue(this.settings.settings.githubUserName)
					.onChange(async (value) => {
						this.settings.settings.githubUserName = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubTokenSetting() {
		const desc = document.createDocumentFragment();

		desc.createEl("span", undefined, (span) => {
			span.innerText =
				"A GitHub token with repo permissions. You can generate it ";

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://github.com/settings/tokens/new?scopes=repo";
				link.innerText = "here!";
			});
		});

		new Setting(this.settingsRootElement)
			.setName("GitHub token")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("Secret Token")
					.setValue(this.settings.settings.githubToken)
					.onChange(async (value) => {
						this.settings.settings.githubToken = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}
}
