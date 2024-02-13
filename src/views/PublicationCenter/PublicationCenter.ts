import { type App, Modal, getIcon, Vault, TFile } from "obsidian";
import DigitalGardenSettings from "../../models/settings";
import { PublishFile } from "../../publishFile/PublishFile";
import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import Publisher from "../../publisher/Publisher";
import PublicationCenterSvelte from "./PublicationCenter.svelte";
import DiffView from "./DiffView.svelte";
import * as Diff from "diff";

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
