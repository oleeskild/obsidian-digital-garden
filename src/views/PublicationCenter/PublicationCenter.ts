import { type App, Modal, getIcon, Vault, TFile } from "obsidian";
import DigitalGardenSettings from "../../models/settings";
import { PublishFile } from "../../publishFile/PublishFile";
import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import Publisher from "../../publisher/Publisher";
import PublicationCenterSvelte from "./PublicationCenter.svelte";
import DiffView from "./DiffView.svelte";
import * as Diff from "diff";
import { PublishPlatform } from "../../models/PublishPlatform";

export class PublicationCenter {
	modal: Modal;
	settings: DigitalGardenSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;
	siteManager: DigitalGardenSiteManager;
	vault: Vault;

	publicationCenterUi!: PublicationCenterSvelte;

	constructor(
		app: App,
		publishStatusManager: PublishStatusManager,
		publisher: Publisher,
		siteManager: DigitalGardenSiteManager,
		settings: DigitalGardenSettings,
	) {
		this.modal = new Modal(app);
		this.settings = settings;
		this.publishStatusManager = publishStatusManager;
		this.publisher = publisher;
		this.siteManager = siteManager;
		this.vault = app.vault;

		this.modal.titleEl
			.createEl("span", { text: "Publication Center" })
			.prepend(this.getIcon("book-up"));

		this.addPlatformLink();
	}

	private addPlatformLink() {
		const linkInfo = this.getPlatformLinkInfo();

		if (!linkInfo) return;

		const repoLink = this.modal.titleEl.createEl("a", {
			cls: "publication-center-repo-link",
			href: linkInfo.url,
			attr: {
				target: "_blank",
				rel: "noopener noreferrer",
			},
		});
		repoLink.appendChild(this.getIcon("external-link"));
		repoLink.style.marginLeft = "8px";
		repoLink.style.opacity = "0.7";
		repoLink.title = linkInfo.tooltip;
	}

	private getPlatformLinkInfo(): { url: string; tooltip: string } | null {
		if (this.settings.publishPlatform === PublishPlatform.ForestryMd) {
			return {
				url: "https://dashboard.forestry.md",
				tooltip: "Open Forestry dashboard",
			};
		}

		if (this.settings.githubUserName && this.settings.githubRepo) {
			return {
				url: `https://github.com/${this.settings.githubUserName}/${this.settings.githubRepo}`,
				tooltip: `Open ${this.settings.githubUserName}/${this.settings.githubRepo} on GitHub`,
			};
		}

		return null;
	}

	getIcon(name: string): Node {
		const icon = getIcon(name) ?? document.createElement("span");

		if (icon instanceof SVGSVGElement) {
			icon.style.marginRight = "4px";
		}

		return icon;
	}

	private showDiff = async (notePath: string) => {
		try {
			const remoteContent =
				await this.siteManager.getNoteContent(notePath);
			const localFile = this.vault.getAbstractFileByPath(notePath);

			const localPublishFile = new PublishFile({
				file: localFile as TFile,
				vault: this.vault,
				compiler: this.publisher.compiler,
				metadataCache: this.publisher.metadataCache,
				settings: this.settings,
			});

			if (localFile instanceof TFile) {
				const [localContent, _] =
					await this.publisher.compiler.generateMarkdown(
						localPublishFile,
					);

				const diff = Diff.diffLines(remoteContent, localContent);
				let diffView: DiffView | undefined;
				const diffModal = new Modal(this.modal.app);

				diffModal.titleEl
					.createEl("span", { text: `${localFile.basename}` })
					.prepend(this.getIcon("file-diff"));

				diffModal.onOpen = () => {
					diffView = new DiffView({
						target: diffModal.contentEl,
						props: { diff: diff },
					});
				};

				this.modal.onClose = () => {
					if (diffView) {
						diffView.$destroy();
					}
				};

				diffModal.open();
			}
		} catch (e) {
			console.error(e);
		}
	};
	open = () => {
		this.modal.onClose = () => {
			this.publicationCenterUi.$destroy();
		};

		this.modal.onOpen = () => {
			this.modal.contentEl.empty();

			this.publicationCenterUi = new PublicationCenterSvelte({
				target: this.modal.contentEl,
				props: {
					publishStatusManager: this.publishStatusManager,
					publisher: this.publisher,
					showDiff: this.showDiff,
					close: () => {
						this.modal.close();
					},
				},
			});
		};

		this.modal.open();
	};
}
