import { debounce, getIcon, Setting } from "obsidian";
import Logger from "js-logger";
import DigitalGardenSettings from "src/models/settings";
import { PublishPlatform } from "src/models/PublishPlatform";
import PublishPlatformConnectionFactory from "src/repositoryConnection/PublishPlatformConnectionFactory";

type ConnectionStatus = "loading" | "connected" | "error";

export class SftpSettings {
	private connectionCheckId = 0;
	private statusElement: HTMLElement;
	private debouncedCheckConnection: () => void;

	constructor(
		private root: HTMLElement,
		private settings: DigitalGardenSettings,
		private saveSettings: () => Promise<void>,
	) {
		const heading = root.createEl("h2");
		heading.createSpan({ text: "SFTP over SSH" });
		this.statusElement = heading.createSpan({ cls: "connection-status" });

		this.debouncedCheckConnection = debounce(
			() => void this.checkConnection(),
			500,
			true,
		);

		const target = root.createDiv({ cls: "publish-provider-settings" });
		this.initializeFields(target);
		void this.checkConnection();
	}

	private initializeFields(target: HTMLElement): void {
		this.addText(
			target,
			"SSH host",
			"Hostname or IP address of the SSH server.",
			"garden.example.com",
			() => this.settings.sftpHost,
			(value) => {
				this.settings.sftpHost = value.trim();
			},
		);

		new Setting(target).setName("SSH port").addText((text) => {
			text.inputEl.type = "number";

			text.setPlaceholder("22")
				.setValue(String(this.settings.sftpPort || 22))
				.onChange((value) =>
					this.checkedChange(() => {
						const port = Number.parseInt(value, 10);

						if (port >= 1 && port <= 65535)
							this.settings.sftpPort = port;
					}),
				);
		});

		this.addText(
			target,
			"Username",
			"",
			"",
			() => this.settings.sftpUsername,
			(value) => {
				this.settings.sftpUsername = value;
			},
		);

		this.addText(
			target,
			"Private key path",
			"Preferred authentication method. Supports ~/ paths.",
			"~/.ssh/id_ed25519",
			() => this.settings.sftpPrivateKeyPath,
			(value) => {
				this.settings.sftpPrivateKeyPath = value;
			},
		);

		this.addSecret(
			target,
			"Private key passphrase",
			"",
			() => this.settings.sftpPrivateKeyPassphrase,
			(value) => {
				this.settings.sftpPrivateKeyPassphrase = value;
			},
		);

		this.addSecret(
			target,
			"Password",
			"Used only when no private key path is configured.",
			() => this.settings.sftpPassword,
			(value) => {
				this.settings.sftpPassword = value;
			},
		);

		this.addText(
			target,
			"Remote garden folder",
			"Absolute server path containing the garden source tree.",
			"/var/www/digitalgarden",
			() => this.settings.sftpRemoteRoot,
			(value) => {
				this.settings.sftpRemoteRoot = value;
			},
		);

		this.addText(
			target,
			"Host key fingerprint",
			"Optional OpenSSH SHA256 fingerprint. When set, connections reject a different server key.",
			"SHA256:...",
			() => this.settings.sftpHostKeyFingerprint,
			(value) => {
				this.settings.sftpHostKeyFingerprint = value.trim();
			},
		);
	}

	private addText(
		target: HTMLElement,
		name: string,
		description: string,
		placeholder: string,
		currentValue: () => string,
		update: (value: string) => void,
	): void {
		new Setting(target)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(currentValue())
					.onChange((value) =>
						this.checkedChange(() => update(value)),
					),
			);
	}

	private addSecret(
		target: HTMLElement,
		name: string,
		description: string,
		currentValue: () => string,
		update: (value: string) => void,
	): void {
		new Setting(target)
			.setName(name)
			.setDesc(description)
			.addText((text) => {
				text.inputEl.type = "password";

				text.setValue(currentValue()).onChange((value) =>
					this.checkedChange(() => update(value)),
				);
			});
	}

	private checkedChange = async (update: () => void): Promise<void> => {
		update();
		this.connectionCheckId++;
		this.renderStatus("loading", "Checking connection...");
		await this.saveSettings();
		this.debouncedCheckConnection();
	};

	private checkConnection = async (): Promise<void> => {
		const checkId = ++this.connectionCheckId;

		if (
			!this.settings.sftpHost.trim() ||
			!this.settings.sftpUsername.trim()
		) {
			this.renderStatus("error", "Fill in host & username");

			return;
		}

		if (!this.settings.sftpRemoteRoot.trim()) {
			this.renderStatus("error", "Please fill in garden root");

			return;
		}

		this.renderStatus("loading", "Checking connection...");

		try {
			const connection =
				PublishPlatformConnectionFactory.createPublishPlatformConnection(
					{
						...this.settings,
						publishPlatform: PublishPlatform.Sftp,
					},
				);
			await connection.getRepositoryInfo();

			if (checkId !== this.connectionCheckId) return;
			this.renderStatus("connected", "Connected");
		} catch (error) {
			if (checkId !== this.connectionCheckId) return;
			Logger.error("SFTP connection test failed", error);

			this.renderStatus(
				"error",
				error instanceof Error
					? error.message
					: "Connection failed. Check your settings.",
			);
		}
	};

	private renderStatus(status: ConnectionStatus, message: string): void {
		this.statusElement.empty();

		const icon = getIcon(
			status === "loading"
				? "loader"
				: status === "connected"
				? "check"
				: "x",
		);

		if (icon) {
			icon.addClass("connection-status-icon");
			this.statusElement.appendChild(icon);
		}

		this.statusElement.createSpan({
			text: message,
			cls: "connection-status-text",
		});
		this.statusElement.className = `connection-status connection-status-${status}`;
	}
}
