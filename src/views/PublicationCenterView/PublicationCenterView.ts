import { ItemView, WorkspaceLeaf, TFile, type App } from "obsidian";
import DigitalGardenSettings from "../../models/settings";
import Publisher from "../../publisher/Publisher";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
import { VIEW_TYPE, VIEW_DISPLAY_TEXT, VIEW_ICON } from "./constants";
import PublicationCenter from "./PublicationCenter.svelte";

interface PublicationCenterViewPlugin {
	app: App;
	settings: DigitalGardenSettings;
}

export class PublicationCenterView extends ItemView {
	private plugin: PublicationCenterViewPlugin;
	private component?: PublicationCenter;

	constructor(leaf: WorkspaceLeaf, plugin: PublicationCenterViewPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return VIEW_DISPLAY_TEXT;
	}

	getIcon(): string {
		return VIEW_ICON;
	}

	async onOpen(): Promise<void> {
		const { app, settings } = this.plugin;

		const siteManager = new DigitalGardenSiteManager(
			app.metadataCache,
			settings,
		);

		const publisher = new Publisher(app.vault, app.metadataCache, settings);

		const statusManager = new PublishStatusManager(siteManager, publisher);

		this.contentEl.empty();
		this.contentEl.addClass("dg-publication-center-view");

		this.component = new PublicationCenter({
			target: this.contentEl,
			props: {
				siteManager,
				publisher,
				statusManager,
				openFile: (path: string) => this.openFile(path),
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = undefined;
	}

	private async openFile(path: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);

		if (file instanceof TFile) {
			await this.plugin.app.workspace.getLeaf("tab").openFile(file);
		}
	}
}
