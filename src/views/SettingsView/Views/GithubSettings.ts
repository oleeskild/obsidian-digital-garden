import { Setting, debounce } from "obsidian";
import SettingView from "../SettingView";
import { FolderSuggest } from "../../../ui/suggest/folder";
import { Octokit } from "@octokit/core";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ text: "pending..." },
		);

		this.initializeGitHubHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeGitHubVaultFolder();
	}

	initializeGitHubHeader = () => {
		this.checkConnectionAndSaveSettings();

		const connectionStatusElement = createEl("span");
		connectionStatusElement.appendText(" (status: connection ");
		connectionStatusElement.append(this.connectionStatusElement);
		connectionStatusElement.appendText(")");

		connectionStatusElement.addClass(
			"quartz-syncer-connection-status",
			"quartz-syncer-connection-status-pending",
		);

		new Setting(this.settingsRootElement)
			.setName("GitHub")
			.setDesc(
				"Quartz Syncer will use this GitHub repository to sync your notes.",
			)
			.setHeading()
			.nameEl.append(connectionStatusElement);
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
				// Token has "contents" permissions
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
		if (this.connectionStatusElement.parentElement === null) {
			return;
		}

		if (this.connectionStatus === "loading") {
			this.connectionStatusElement.innerText = "pending...";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-success",
				"quartz-syncer-connection-status-failed",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-pending",
			);
		}

		if (this.connectionStatus === "connected") {
			this.connectionStatusElement.innerText = "succesful!";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-failed",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-success",
			);
		}

		if (this.connectionStatus === "error") {
			this.connectionStatusElement.innerText = "failed!";

			this.connectionStatusElement.parentElement.classList.remove(
				"quartz-syncer-connection-status-pending",
				"quartz-syncer-connection-status-success",
			);

			this.connectionStatusElement.parentElement.classList.add(
				"quartz-syncer-connection-status-failed",
			);
		}
	};

	private initializeGitHubVaultFolder() {
		const app = this.settings.app;

		new Setting(this.settingsRootElement)
			.setName("Vault root folder name")
			.setDesc(
				'The folder in your Obsidian vault that Quartz Syncer should consider as your Quartz website root folder. Useful for Obsidian vaults that are not exclusively used for Quartz. By default "/" (the root of your Obsidian vault).',
			)
			.addSearch((text) => {
				new FolderSuggest(app, text.inputEl);

				text.setPlaceholder("/")
					.setValue(this.settings.settings.vaultPath)
					.onChange(async (value) => {
						if (value.length === 0 || !value.endsWith("/")) {
							value += "/";
						}
						this.settings.settings.vaultPath = value;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}
	private initializeGitHubRepoSetting() {
		new Setting(this.settingsRootElement)
			.setName("Repository name")
			.setDesc("The name of your Quartz repository on GitHub.")
			.addText((text) =>
				text
					.setPlaceholder("quartz")
					.setValue(this.settings.settings.githubRepo)
					.onChange(async (value) => {
						if (value.length === 0) {
							value = "quartz";
						}

						this.settings.settings.githubRepo = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubUserNameSetting() {
		new Setting(this.settingsRootElement)
			.setName("Username")
			.setDesc("The username on GitHub that owns the Quartz repository.")
			.addText((text) =>
				text
					.setPlaceholder("username")
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
				'A GitHub access token with "contents" permissions. You can find instructions to generate it in ';

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://saberzero1.github.io/quartz-syncer-docs/Guides/Generating-an-access-token";
				link.innerText = "the documentation.";
			});
		});

		new Setting(this.settingsRootElement)
			.setName("Access token")
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
