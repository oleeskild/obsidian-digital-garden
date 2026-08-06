import { Setting, TextComponent, debounce, getIcon } from "obsidian";
import SettingView from "./SettingView";
import { PublishPlatform } from "src/models/PublishPlatform";
import PublishPlatformConnectionFactory from "src/repositoryConnection/PublishPlatformConnectionFactory";
import type { IRepositoryConnection } from "src/repositoryConnection/RepositoryConnection";

export class GitSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
	connectionStatusMessage: string = "";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;
	private platform: PublishPlatform;
	private connectionCheckId = 0;
	private headerLabelElement!: HTMLSpanElement;
	private headerIconElement!: HTMLSpanElement;
	private forgejoApiSetting?: Setting;
	private forgejoApiInput?: TextComponent;

	constructor(
		settings: SettingView,
		settingsRootElement: HTMLElement,
		platform = settings.settings.publishPlatform,
	) {
		this.settings = settings;
		this.platform = platform;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.id = "github-settings";
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ cls: "connection-status" },
		);
		this.updateConnectionStatusIndicator();
		this.initializeHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeForgejoApiUrlSetting();

		this.updatePlatformElements();
		// Rendered last with prepend() so the nudge sits above the header.
		this.initializeForestryUpgradeNotice();
	}

	/**
	 * Nudge self-hosted users toward the managed Forestry.md platform right at
	 * the point of setup friction (GitHub token/repo config). Dismissible and
	 * persisted so it's shown at most until the user opts out.
	 */
	initializeForestryUpgradeNotice = () => {
		if (this.settings.settings.hideForestryUpgradeNotice) {
			return;
		}

		const notice = createEl("div", { cls: "dg-forestry-upgrade-notice" });

		const dismissButton = notice.createEl("button", {
			cls: "dg-forestry-upgrade-dismiss",
			attr: { "aria-label": "Dismiss" },
		});
		const dismissIcon = getIcon("x");

		if (dismissIcon) {
			dismissButton.appendChild(dismissIcon);
		} else {
			dismissButton.setText("×");
		}

		dismissButton.addEventListener("click", async () => {
			this.settings.settings.hideForestryUpgradeNotice = true;
			await this.settings.saveSettings();
			notice.remove();
		});

		const heading = notice.createEl("div", {
			cls: "dg-forestry-upgrade-heading",
		});
		const headingIcon = getIcon("trees");

		if (headingIcon) {
			heading.appendChild(headingIcon);
		}
		heading.createSpan({ text: "Rather skip the GitHub setup?" });

		notice.createEl("p", {
			cls: "dg-forestry-upgrade-text",
			text: "Forestry.md hosts your digital garden for you. No GitHub account, personal access tokens, or repository config required. Connect once with a Garden Key and publish straight from Obsidian. There's a free tier to get started.",
		});

		const actions = notice.createEl("div", {
			cls: "dg-forestry-upgrade-actions",
		});

		const switchButton = actions.createEl("button", {
			text: "Switch to Forestry.md",
			cls: "mod-cta",
		});

		switchButton.addEventListener("click", async () => {
			await this.settings.switchPublishPlatform(
				PublishPlatform.ForestryMd,
			);
		});

		actions.createEl("a", {
			text: "Learn more",
			cls: "dg-forestry-upgrade-link",
			href: "https://forestry.md",
			attr: { target: "_blank", rel: "noopener" },
		});

		this.settingsRootElement.prepend(notice);
	};

	initializeHeader = () => {
		this.checkConnectionAndSaveSettings();

		const githubSettingsHeader = createEl("h3");
		this.headerIconElement = githubSettingsHeader.createSpan();
		this.headerLabelElement = githubSettingsHeader.createSpan();
		githubSettingsHeader.append(this.connectionStatusElement);

		this.settingsRootElement.prepend(githubSettingsHeader);
	};

	setPlatform(platform: PublishPlatform): void {
		if (platform === this.platform) return;
		this.platform = platform;
		this.connectionCheckId++;
		this.connectionStatus = "loading";
		this.connectionStatusMessage = "";
		this.updatePlatformElements();
		this.updateConnectionStatusIndicator();
		this.debouncedUpdateConnectionStatus();
	}

	private updatePlatformElements(): void {
		const isForgejo = this.platform === PublishPlatform.Forgejo;

		this.headerLabelElement.setText(
			isForgejo
				? "Forgejo Authentication (required)"
				: "GitHub Authentication (required)",
		);
		this.headerIconElement.empty();

		this.headerIconElement.append(
			this.settings.getIcon(isForgejo ? "git-fork" : "github"),
		);
		this.forgejoApiInput?.setDisabled(!isForgejo);

		this.forgejoApiSetting?.settingEl.toggleClass(
			"is-disabled",
			!isForgejo,
		);
	}

	checkConnectionAndSaveSettings = async () => {
		// Invalidate any request that is still using the previous field values.
		this.connectionCheckId++;
		await this.settings.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	updateConnectionStatus = async () => {
		const checkId = ++this.connectionCheckId;
		const githubToken = this.settings.settings.gitToken.trim();
		const githubUserName = this.settings.settings.gitUsername.trim();
		const githubRepo = this.settings.settings.gitRepo.trim();

		if (!githubToken || !githubUserName || !githubRepo) {
			this.setConnectionError("Please fill in all required fields");
			this.updateConnectionStatusIndicator();

			return;
		}

		// Show loading state while checking
		this.connectionStatus = "loading";
		this.connectionStatusMessage = "";
		this.updateConnectionStatusIndicator();

		const baseUrl = this.settings.settings.forgejoApiUrl
			?.trim()
			.replace(/\/+$/, "");

		if (this.platform === PublishPlatform.Forgejo && !baseUrl) {
			this.setConnectionError("Please enter the Forgejo API URL");
			this.updateConnectionStatusIndicator();

			return;
		}

		try {
			const connection =
				await PublishPlatformConnectionFactory.createPublishPlatformConnection(
					{
						...this.settings.settings,
						publishPlatform: this.platform,
					},
				);
			const repository = await connection.getRepositoryInfo();

			if (checkId !== this.connectionCheckId) return;

			if (!repository)
				throw new Error("Repository information unavailable");

			const hasWriteAccess = this.checkWritePermissions(
				repository.permissions,
			);

			if (hasWriteAccess) {
				this.setConnectionSuccess("Connected with full access");
			} else if (repository.default_branch) {
				const contentAccessible = await this.validateContentAccess(
					connection,
					repository.default_branch,
				);

				if (checkId !== this.connectionCheckId) return;

				if (contentAccessible) this.setConnectionSuccess("Connected");
				else {
					this.setConnectionError(
						"Token lacks content permissions. For fine-grained PATs, ensure 'Contents' has read and write access.",
					);
				}
			} else {
				this.setConnectionError("Repository has no default branch");
			}
		} catch (error: unknown) {
			if (checkId !== this.connectionCheckId) return;
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
		connection: IRepositoryConnection,
		branch: string,
	): Promise<boolean> {
		try {
			await connection.getContent(branch);

			return true;
		} catch {
			return false;
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
			401: "Invalid token. Please check your Git token.",
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
			.setName("Git repo name")
			.setDesc("The name of the Git repository")
			.addText((text) =>
				text
					.setPlaceholder("mydigitalgarden")
					.setValue(this.settings.settings.gitRepo)
					.onChange(async (value) => {
						this.settings.settings.gitRepo = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubUserNameSetting() {
		new Setting(this.settingsRootElement)
			.setName("Git Username")
			.setDesc("Your Git Username")
			.addText((text) =>
				text
					.setPlaceholder("myusername")
					.setValue(this.settings.settings.gitUsername)
					.onChange(async (value) => {
						this.settings.settings.gitUsername = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubTokenSetting() {
		const desc = document.createDocumentFragment();

		desc.createEl("span", undefined, (span) => {
			span.innerText =
				"A Git token with contents permissions. You can see how to generate it ";

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://docs.forestry.md/advanced/fine-grained-access-token/";
				link.innerText = "here!";
			});
		});

		new Setting(this.settingsRootElement)
			.setName("Git token")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("Secret Token")
					.setValue(this.settings.settings.gitToken)
					.onChange(async (value) => {
						this.settings.settings.gitToken = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeForgejoApiUrlSetting() {
		this.forgejoApiSetting = new Setting(this.settingsRootElement)
			.setName("Forgejo API URL")
			.setDesc(
				"Full REST API root, typically https://git.example.com/api/v1.",
			)
			.addText((text) => {
				this.forgejoApiInput = text;

				text.setPlaceholder("https://git.example.com/api/v1")
					.setValue(this.settings.settings.forgejoApiUrl ?? "")
					.onChange(async (value) => {
						this.settings.settings.forgejoApiUrl = value;
						await this.checkConnectionAndSaveSettings();
					});
			});
	}
}
