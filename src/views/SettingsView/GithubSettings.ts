import { Setting, debounce, getIcon } from "obsidian";
import SettingView from "./SettingView";
import { Octokit } from "@octokit/core";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	connectionStatusMessage: string = "";
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
	}

	initializeHeader = () => {
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
		const { githubToken, githubUserName, githubRepo } =
			this.settings.settings;

		if (!githubToken || !githubUserName || !githubRepo) {
			this.setConnectionError("Please fill in all required fields");

			return;
		}

		// Show loading state while checking
		this.connectionStatus = "loading";
		this.connectionStatusMessage = "";
		this.updateConnectionStatusIndicator();

		const octokit = new Octokit({ auth: githubToken });

		try {
			const repoResponse = await octokit.request(
				"GET /repos/{owner}/{repo}",
				{ owner: githubUserName, repo: githubRepo },
			);

			const hasWriteAccess = this.checkWritePermissions(
				repoResponse.data.permissions,
			);

			if (hasWriteAccess) {
				this.setConnectionSuccess("Connected with full access");
			} else {
				await this.validateContentAccess(
					octokit,
					githubUserName,
					githubRepo,
					repoResponse.data.default_branch,
				);
			}
		} catch (error: unknown) {
			this.handleConnectionError(error, githubUserName, githubRepo);
		}

		this.updateConnectionStatusIndicator();
	};

	private checkWritePermissions(
		permissions: { admin?: boolean; push?: boolean } | undefined,
	): boolean {
		return !!(permissions && (permissions.admin || permissions.push));
	}

	private async validateContentAccess(
		octokit: Octokit,
		owner: string,
		repo: string,
		branch: string,
	): Promise<void> {
		try {
			await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
				owner,
				repo,
				ref: `heads/${branch}`,
			});
			this.setConnectionSuccess("Connected");
		} catch {
			this.setConnectionError(
				"Token lacks content permissions. For fine-grained PATs, ensure 'Contents' has read and write access.",
			);
		}
	}

	private handleConnectionError(
		error: unknown,
		userName: string,
		repo: string,
	): void {
		if (!(error instanceof Error) || !("status" in error)) {
			this.setConnectionError("Connection failed. Check your settings.");

			return;
		}

		const status = (error as { status: number }).status;

		const errorMessages: Record<number, string> = {
			401: "Invalid token. Please check your GitHub token.",
			403: "Access forbidden. Token may lack required permissions or rate limit exceeded.",
			404: `Repository '${userName}/${repo}' not found. Check username and repo name, or ensure token has repository access.`,
		};

		this.setConnectionError(
			errorMessages[status] || `Connection failed (${status})`,
		);
	}

	private setConnectionSuccess(message: string): void {
		this.connectionStatus = "connected";
		this.connectionStatusMessage = message;
	}

	private setConnectionError(message: string): void {
		this.connectionStatus = "error";
		this.connectionStatusMessage = message;
	}

	debouncedUpdateConnectionStatus = debounce(
		this.updateConnectionStatus,
		500,
		true,
	);

	updateConnectionStatusIndicator = () => {
		// Clear previous content
		this.connectionStatusElement.empty();

		let iconName: string;
		let statusText: string;
		let statusClass: string;

		if (this.connectionStatus === "loading") {
			iconName = "loader";
			statusText = "Checking connection...";
			statusClass = "connection-status-loading";
		} else if (this.connectionStatus === "connected") {
			iconName = "check";
			statusText = this.connectionStatusMessage || "Connected";
			statusClass = "connection-status-connected";
		} else {
			iconName = "x";
			statusText = this.connectionStatusMessage || "Connection error";
			statusClass = "connection-status-error";
		}

		// Add icon
		const icon = getIcon(iconName);

		if (icon) {
			icon.addClass("connection-status-icon");
			this.connectionStatusElement.appendChild(icon);
		}

		// Add status text
		this.connectionStatusElement.createSpan({
			text: statusText,
			cls: "connection-status-text",
		});

		// Update container class for styling
		this.connectionStatusElement.className = `connection-status ${statusClass}`;
	};

	private initializeGitHubRepoSetting() {
		new Setting(this.settingsRootElement)
			.setName("GitHub repo name")
			.setDesc("The name of the GitHub repository")
			.addText((text) =>
				text
					.setPlaceholder("mydigitalgarden")
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
				"A GitHub token with contents permissions. You can see how to generate it ";

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://dg-docs.ole.dev/advanced/fine-grained-access-token/";
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
