import { ItemView, WorkspaceLeaf, TFile, type App } from "obsidian";
import { mount, unmount } from "svelte";
import DigitalGardenSettings from "../../models/settings";
import Publisher from "../../publisher/Publisher";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
import type { SiteUpdateTracker } from "../../forestry/SiteUpdateTracker";
import { VIEW_TYPE, VIEW_DISPLAY_TEXT, VIEW_ICON } from "./constants";
import { findHomePageFiles } from "../../publishFile/homePage";
import PublicationCenter from "./PublicationCenter.svelte";

interface PublicationCenterViewPlugin {
	app: App;
	settings: DigitalGardenSettings;
	siteUpdateTracker: SiteUpdateTracker | null;
	openHomePagePicker: () => void;
}

export class PublicationCenterView extends ItemView {
	private plugin: PublicationCenterViewPlugin;
	private component?: ReturnType<typeof mount>;
	private refreshApi?: { maybeRefresh: () => void };

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
		this.remountComponent();

		// Refresh quietly whenever this view becomes the active leaf, so it
		// reflects edits made while it was in the background.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) this.maybeRefresh();
			}),
		);
	}

	/**
	 * (Re)mount the Svelte component from current plugin state. Called on
	 * open and again when settings change something the view captures as
	 * props (e.g. the publish platform's site-update tracker).
	 */
	remountComponent(): void {
		const { app, settings } = this.plugin;

		if (this.component) {
			unmount(this.component);
			this.component = undefined;
			this.refreshApi = undefined;
		}

		const siteManager = new DigitalGardenSiteManager(
			app.metadataCache,
			settings,
		);

		const publisher = new Publisher(app.vault, app.metadataCache, settings);

		const statusManager = new PublishStatusManager(siteManager, publisher);

		this.contentEl.empty();
		this.contentEl.addClass("dg-publication-center-view");

		this.component = mount(PublicationCenter, {
			target: this.contentEl,
			props: {
				siteManager,
				publisher,
				statusManager,
				// Only set for gardens hosted on Forestry.md.
				siteUpdateTracker: this.plugin.siteUpdateTracker,
				// Only Forestry gardens get the "no home page" banner; the
				// vault scan runs on each status refresh.
				homePageMissing: this.plugin.siteUpdateTracker
					? () => findHomePageFiles(app).length === 0
					: null,
				onChooseHomePage: () => this.plugin.openHomePagePicker(),
				openFile: (path: string) => this.openFile(path),
				registerApi: (api: { maybeRefresh: () => void }) => {
					this.refreshApi = api;
				},
			},
		});
	}

	async onClose(): Promise<void> {
		if (this.component) {
			unmount(this.component);
		}
		this.component = undefined;
		this.refreshApi = undefined;
	}

	/** Trigger a debounced background refresh (e.g. on reactivation). */
	maybeRefresh(): void {
		this.refreshApi?.maybeRefresh();
	}

	private async openFile(path: string): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);

		if (file instanceof TFile) {
			await this.plugin.app.workspace.getLeaf("tab").openFile(file);
		}
	}
}
