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
		this.initializeContentBasePathSetting();
	}

	initializeHeader = () => {
		this.checkConnectionAndSaveSettings();

		const githubSettingsHeader = createEl("h3", {
			text: "GitHub 仓库设置（必填）",
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
			this.setConnectionError("请填写所有必填项");

			return;
		}

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
				this.setConnectionSuccess("连接成功，具有写入权限");
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
			this.setConnectionSuccess("连接成功");
		} catch {
			this.setConnectionError(
				"令牌缺少内容权限。对于细粒度 PAT，请确保 'Contents' 具有读写权限。",
			);
		}
	}

	private handleConnectionError(
		error: unknown,
		userName: string,
		repo: string,
	): void {
		if (!(error instanceof Error) || !("status" in error)) {
			this.setConnectionError("连接失败，请检查设置。");

			return;
		}

		const status = (error as { status: number }).status;

		const errorMessages: Record<number, string> = {
			401: "无效的令牌，请检查 GitHub Token。",
			403: "访问被拒绝，令牌可能缺少所需权限或超出速率限制。",
			404: `未找到仓库 '${userName}/${repo}'，请检查用户名和仓库名，或确保令牌具有仓库访问权限。`,
		};

		this.setConnectionError(
			errorMessages[status] || `连接失败 (${status})`,
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
		this.connectionStatusElement.empty();

		let iconName: string;
		let statusText: string;
		let statusClass: string;

		if (this.connectionStatus === "loading") {
			iconName = "loader";
			statusText = "检查连接中...";
			statusClass = "connection-status-loading";
		} else if (this.connectionStatus === "connected") {
			iconName = "check";
			statusText = this.connectionStatusMessage || "连接成功";
			statusClass = "connection-status-connected";
		} else {
			iconName = "x";
			statusText = this.connectionStatusMessage || "连接错误";
			statusClass = "connection-status-error";
		}

		const icon = getIcon(iconName);

		if (icon) {
			icon.addClass("connection-status-icon");
			this.connectionStatusElement.appendChild(icon);
		}

		this.connectionStatusElement.createSpan({
			text: statusText,
			cls: "connection-status-text",
		});

		this.connectionStatusElement.className = `connection-status ${statusClass}`;
	};

	private initializeGitHubRepoSetting() {
		new Setting(this.settingsRootElement)
			.setName("仓库名称")
			.setDesc("GitHub 仓库名称（例如：myblog）")
			.addText((text) =>
				text
					.setPlaceholder("myblog")
					.setValue(this.settings.settings.githubRepo)
					.onChange(async (value) => {
						this.settings.settings.githubRepo = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeGitHubUserNameSetting() {
		new Setting(this.settingsRootElement)
			.setName("GitHub 用户名")
			.setDesc("您的 GitHub 用户名")
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
			span.innerText = "具有 contents 权限的 GitHub 令牌。查看如何生成：";

			span.createEl("a", undefined, (link) => {
				link.href =
					"https://dg-docs.ole.dev/advanced/fine-grained-access-token/";
				link.innerText = "点击这里";
			});
		});

		new Setting(this.settingsRootElement)
			.setName("GitHub Token")
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder("ghp_xxxxxxxxxxxx")
					.setValue(this.settings.settings.githubToken)
					.onChange(async (value) => {
						this.settings.settings.githubToken = value;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}

	private initializeContentBasePathSetting() {
		new Setting(this.settingsRootElement)
			.setName("内容发布路径")
			.setDesc("笔记在仓库中的发布路径，默认为：src/content/")
			.addText((text) =>
				text
					.setPlaceholder("src/content/")
					.setValue(this.settings.settings.contentBasePath)
					.onChange(async (value) => {
						const normalizedPath = value.endsWith("/")
							? value
							: value + "/";
						this.settings.settings.contentBasePath = normalizedPath;
						await this.checkConnectionAndSaveSettings();
					}),
			);
	}
}
