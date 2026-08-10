import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Setting,
	Platform,
	type App,
} from "obsidian";
import { mount, unmount } from "svelte";
import DigitalGardenSettings from "../../models/settings";
import Publisher from "../../publisher/Publisher";
import PublishStatusManager from "../../publisher/PublishStatusManager";
import DigitalGardenSiteManager from "../../repositoryConnection/DigitalGardenSiteManager";
import { VIEW_TYPE, VIEW_DISPLAY_TEXT, VIEW_ICON } from "./constants";
import PublicationCenter from "./PublicationCenter.svelte";
import {
	PublicationProvider,
	platformForProvider,
} from "../../models/PublicationProvider";

interface PublicationCenterViewPlugin {
	app: App;
	settings: DigitalGardenSettings;
}

export class PublicationCenterView extends ItemView {
	private plugin: PublicationCenterViewPlugin;
	private component?: ReturnType<typeof mount>;
	private refreshApi?: { maybeRefresh: () => void };
	private provider: PublicationProvider;

	constructor(leaf: WorkspaceLeaf, plugin: PublicationCenterViewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.provider = plugin.settings.publicationProvider;
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
		this.contentEl.empty();
		this.contentEl.addClass("dg-publication-center-view");
		this.renderProviderPicker();
		this.mountCenter();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) this.maybeRefresh();
			}),
		);
	}

	private mountCenter(): void {
		const { app } = this.plugin;

		const settings = new Proxy(this.plugin.settings, {
			get: (target, property, receiver) =>
				property === "publishPlatform"
					? platformForProvider(this.provider, target.gitProvider)
					: Reflect.get(target, property, receiver),
		});

		const siteManager = new DigitalGardenSiteManager(
			app.metadataCache,
			settings,
		);

		const publisher = new Publisher(app.vault, app.metadataCache, settings);

		const statusManager = new PublishStatusManager(siteManager, publisher);

		this.component = mount(PublicationCenter, {
			target: this.contentEl.createDiv({ cls: "dg-pc-provider-content" }),
			props: {
				siteManager,
				publisher,
				statusManager,
				openFile: (path: string) => this.openFile(path),
				registerApi: (api: { maybeRefresh: () => void }) => {
					this.refreshApi = api;
				},
			},
		});
	}

	private renderProviderPicker(): void {
		new Setting(this.contentEl)
			.setName("Publication provider")
			.addDropdown((dropdown) => {
				dropdown.addOption(PublicationProvider.Git, "Git");

				if (Platform.isDesktop)
					dropdown.addOption(PublicationProvider.Sftp, "SFTP");

				return dropdown
					.addOption(PublicationProvider.LocalFolder, "Local folder")
					.addOption(PublicationProvider.Forest, "Forest")
					.setValue(this.provider)
					.onChange((value) => {
						this.provider = value as PublicationProvider;

						if (this.component) unmount(this.component);
						this.component = undefined;

						this.contentEl
							.querySelector(".dg-pc-provider-content")
							?.remove();
						this.mountCenter();
					});
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
