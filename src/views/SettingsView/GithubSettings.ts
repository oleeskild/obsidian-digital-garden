import { Setting, TextComponent, debounce, getIcon } from "obsidian";
import SettingView from "./SettingView";
import { Octokit } from "@octokit/core";
import { PublishPlatform } from "src/models/PublishPlatform";

export class GithubSettings {
	settings: SettingView;
	connectionStatus: "loading" | "connected" | "error";
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

		this.connectionStatusElement = this.settingsRootElement.createEl(
			"span",
			{ cls: "connection-status" },
		);
		this.initializeHeader();
		this.initializeGitHubRepoSetting();
		this.initializeGitHubUserNameSetting();
		this.initializeGitHubTokenSetting();
		this.initializeContentBaseDirSetting();
		this.initializePublishBranchSetting();
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

			this.showDefaultBranch(repoResponse.data.default_branch);

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
	};

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
					"https://docs.forestry.md/advanced/fine-grained-access-token/";
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

	private initializeContentBaseDirSetting() {
		new Setting(this.settingsRootElement)
			.setName("Content base directory (advanced)")
			.setDesc(
				"Subdirectory inside your repository where the digital garden template lives (e.g. Web). Leave empty if the template is at the repo root. Affects GitHub publishing, remote settings, and local export.",
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

	private initializePublishBranchSetting() {
		const desc = document.createDocumentFragment();

		desc.createDiv({
			text: "The branch the plugin publishes to and reads from. Leave it as your repository's default branch unless you want to review changes and merge them yourself.",
		});

		desc.createDiv({ text: "If you use another branch:" });

		const risks = desc.createEl("ul");

		for (const risk of [
			"Nothing goes live until you merge this branch into the default branch. The plugin never merges or opens pull requests for you.",
			"Everything goes to this branch: notes, site settings, favicon and logo, navigation order, garden plugins, and template update pull requests.",
			"The Publication Center and settings show what is on this branch, not what is on your live site.",
			"Changes made directly to the default branch are not on this branch until you merge them into it.",
			"If you squash or rebase when merging and keep the branch, later merges can conflict. Use merge commits, or delete the branch after merging.",
			"The plugin never creates the branch. If it does not exist, for example because it was deleted after a merge, publishing fails until you create it on GitHub or change this setting.",
		]) {
			risks.createEl("li", { text: risk });
		}

		new Setting(this.settingsRootElement)
			.setName("Publish branch (advanced)")
			.setDesc(desc)
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
