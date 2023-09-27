import { type App, Modal, getIcon, Vault, TFile } from "obsidian";
import Publisher from "../publisher/Publisher";
import PublishStatusManager from "../publisher/PublishStatusManager";
import DigitalGardenSettings from "../models/settings";
import PublicationCenter from "./PublicationCenter.svelte";
import DiffView from "./DiffView.svelte";
import DigitalGardenSiteManager from "src/publisher/DigitalGardenSiteManager";
import * as Diff from "diff";

export class PublishModal {
	modal: Modal;
	settings: DigitalGardenSettings;
	publishStatusManager: PublishStatusManager;
	publisher: Publisher;
	siteManager: DigitalGardenSiteManager;
	vault: Vault;

	publicationCenterUi!: PublicationCenter;

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

			if (localFile instanceof TFile) {
				const [localContent, _] =
					await this.publisher.compiler.generateMarkdown(localFile);
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

			this.publicationCenterUi = new PublicationCenter({
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
