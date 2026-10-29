import { Setting, TextComponent, debounce, getIcon } from "obsidian";
import SettingView from "./SettingView";
import { Octokit } from "@octokit/core";
import { PublishPlatform } from "src/models/PublishPlatform";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "idle" | "loading" | "connected" | "error";
	connectionStatusMessage: string = "";
	private settingsRootElement: HTMLElement;
	connectionStatusElement: HTMLElement;
	/** The repository's default branch, once the connection check has fetched it. */
	private defaultBranch?: string;
	private publishBranchInput?: TextComponent;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.id = "github-settings";
		this.settingsRootElement.classList.add("settings-tab-content");
		this.connectionStatus = "loading";

		this.initializeHeader();

		// Announced when it changes, outside the heading so the heading's
		// name stays stable.
		this.connectionStatusElement = this.settingsRootElement.createDiv({
			cls: "connection-status",
			attr: { role: "status", "aria-live": "polite" },
		});
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubTokenSetting();
		this.initializeAdvancedSettings();
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
			text: "Forestry.md hosts your garden for you, so you don't need a GitHub account, token or repository. Connect once with a Garden Key and publish from Obsidian. There's a free plan.",
		});

		const actions = notice.createEl("div", {
			cls: "dg-forestry-upgrade-actions",
		});

		// A plain button: the accent belongs to this track's own next step.
		const switchButton = actions.createEl("button", {
			text: "Switch to Forestry.md",
		});

		switchButton.addEventListener("click", async () => {
			await this.settings.switchPublishPlatform(
				PublishPlatform.ForestryMd,
			);
		});

		actions.createEl("a", {
			text: "Learn about Forestry.md",
			cls: "dg-forestry-upgrade-link",
			href: "https://forestry.md",
			attr: { target: "_blank", rel: "noopener" },
		});

		this.settingsRootElement.prepend(notice);
	};

	initializeHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("GitHub connection")
			.setHeading();

		// Runs after the status element exists (debounced).
		this.checkConnectionAndSaveSettings();
	};

	checkConnectionAndSaveSettings = async () => {
		this.settings.saveSettings();
		this.debouncedUpdateConnectionStatus();
	};

	updateConnectionStatus = async () => {
		const { githubToken, githubUserName, githubRepo } =
			this.settings.settings;

		if (!githubToken || !githubUserName || !githubRepo) {
			this.connectionStatus = "idle";

			this.connectionStatusMessage =
				"Fill in your GitHub username, repository and access token to connect.";
			this.updateConnectionStatusIndicator();
			this.settings.onConnectionChanged(false);

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

			const defaultBranch = repoResponse.data.default_branch;

			// A publish branch typed before the default branch was known is
			// stored as-is; once known, store the default branch as unset like
			// the field's onChange does, so it keeps following the repository.
			if (this.settings.settings.publishBranch === defaultBranch) {
				this.settings.settings.publishBranch = undefined;
				await this.settings.saveSettings();
			}

			this.showDefaultBranch(defaultBranch);

			const hasWriteAccess = this.checkWritePermissions(
				repoResponse.data.permissions,
			);

			const { publishBranch } = this.settings.settings;

			if (
				publishBranch &&
				!(await this.branchExists(
					octokit,
					githubUserName,
					githubRepo,
					publishBranch,
				))
			) {
				this.setConnectionError(
					`Publish branch "${publishBranch}" not found. Create it on GitHub or change the publish branch.`,
				);
			} else if (hasWriteAccess) {
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
		// Read through a method: TS narrows the field to "loading" above.
		this.settings.onConnectionChanged(this.isConnected());
	};

	private isConnected(): boolean {
		return this.connectionStatus === "connected";
	}

	private checkWritePermissions(
		permissions: { admin?: boolean; push?: boolean } | undefined,
	): boolean {
		return !!(permissions && (permissions.admin || permissions.push));
	}

	/** Used to flag a missing publish branch here, before a publish fails on it. */
	private async branchExists(
		octokit: Octokit,
		owner: string,
		repo: string,
		branch: string,
	): Promise<boolean> {
		try {
			await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
				owner,
				repo,
				ref: `heads/${branch}`,
			});

			return true;
		} catch (error) {
			if ((error as { status?: unknown }).status === 404) {
				return false;
			}

			throw error;
		}
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
				"The token can't read the repository's contents. Give it read and write access to Contents.",
			);
		}
	}

	private handleConnectionError(
		error: unknown,
		userName: string,
		repo: string,
	): void {
		if (!(error instanceof Error) || !("status" in error)) {
			this.setConnectionError(
				"Couldn't reach GitHub. Check your internet connection and the settings below.",
			);

			return;
		}

		const status = (error as { status: number }).status;

		const errorMessages: Record<number, string> = {
			401: "GitHub didn't accept the access token. It may have expired; create a new one.",
			403: "GitHub refused access. The token may lack permissions, or GitHub's rate limit was hit; wait a minute and try again.",
			404: `Couldn't find ${userName}/${repo}. Check the username and repository, and that the token can access that repository.`,
		};

		this.setConnectionError(
			errorMessages[status] ||
				`Couldn't connect to GitHub (error ${status}).`,
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

		if (this.connectionStatus === "idle") {
			iconName = "plug";
			statusText = this.connectionStatusMessage;
			statusClass = "connection-status-idle";
		} else if (this.connectionStatus === "loading") {
			iconName = "loader";
			statusText = "Checking the connection…";
			statusClass = "connection-status-loading";
		} else if (this.connectionStatus === "connected") {
			iconName = "check";
			statusText = this.connectionStatusMessage || "Connected";
			statusClass = "connection-status-connected";
		} else {
			iconName = "x";

			statusText =
				this.connectionStatusMessage || "Couldn't connect to GitHub.";
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
			.setName("Repository")
			.setDesc("The name of your garden's repository on GitHub.")
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
			.setName("GitHub username")
			.setDesc("The account or organization that owns the repository.")
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

		desc.appendText(
			"A fine-grained token with read and write access to Contents and Pull requests. ",
		);

		desc.createEl("a", {
			text: "How to create a token",
			href: "https://docs.forestry.md/advanced/fine-grained-access-token/",
		});

		let tokenInput: TextComponent | null = null;

		new Setting(this.settingsRootElement)
			.setName("Access token")
			.setDesc(desc)
			.addText((text) => {
				tokenInput = text;
				// Hidden like a password, so it isn't exposed when sharing a screen.
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.inputEl.setAttribute("aria-label", "Access token");

				text.setValue(this.settings.settings.githubToken).onChange(
					async (value) => {
						this.settings.settings.githubToken = value;
						await this.checkConnectionAndSaveSettings();
					},
				);
			})
			.addExtraButton((button) => {
				button.setIcon("eye").setTooltip("Show token");

				button.onClick(() => {
					const input = tokenInput?.inputEl;

					if (!input) return;

					const hidden = input.type === "password";
					input.type = hidden ? "text" : "password";

					button
						.setIcon(hidden ? "eye-off" : "eye")
						.setTooltip(hidden ? "Hide token" : "Show token");
				});
			});
	}

	/**
	 * Collapsed by default so most users never see these. Opens on its own
	 * once either is set, so a non-default value is never hidden.
	 */
	private initializeAdvancedSettings() {
		const { contentBaseDir, publishBranch } = this.settings.settings;

		const details = this.settingsRootElement.createEl("details", {
			cls: "dg-advanced-settings",
		});
		details.open = !!(contentBaseDir || publishBranch);
		details.createEl("summary", { text: "Advanced" });

		this.initializeContentBaseDirSetting(details);
		this.initializePublishBranchSetting(details);
	}

	private initializeContentBaseDirSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Content base directory")
			.setDesc(
				"Subfolder of the repository that holds the garden template, e.g. Web. Leave empty if it is at the root.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Web")
					.setValue(this.settings.settings.contentBaseDir ?? "")
					.onChange(async (value) => {
						this.settings.settings.contentBaseDir = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	/**
	 * Show the default branch in the publish branch field while no other
	 * branch is set, so the field names the branch actually used.
	 */
	private showDefaultBranch(defaultBranch: string) {
		this.defaultBranch = defaultBranch;
		const input = this.publishBranchInput;

		if (
			input &&
			!this.settings.settings.publishBranch &&
			document.activeElement !== input.inputEl
		) {
			input.setValue(defaultBranch);
		}
	}

	private initializePublishBranchSetting(containerEl: HTMLElement) {
		new Setting(containerEl)
			.setName("Publish branch")
			.setDesc(
				"Publish to another branch to review changes before they go live. Nothing goes live until you merge it into the default branch yourself, and the branch must already exist.",
			)
			.addText((text) => {
				this.publishBranchInput = text;
				text.setPlaceholder("main");

				text.setValue(
					this.settings.settings.publishBranch ??
						this.defaultBranch ??
						"",
				).onChange(async (value) => {
					const branch = value.trim();

					// The default branch is stored as unset, so it keeps
					// following the repository if its default changes.
					this.settings.settings.publishBranch =
						branch && branch !== this.defaultBranch
							? branch
							: undefined;
					// Re-runs the connection check, which flags a missing branch.
					await this.checkConnectionAndSaveSettings();
				});
			});
	}
}
