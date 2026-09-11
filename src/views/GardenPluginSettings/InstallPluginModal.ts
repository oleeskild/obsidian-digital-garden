import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import InstallPluginView from "./InstallPluginView.svelte";
import { GardenPluginManager } from "../../gardenPlugins/GardenPluginManager";
import { RepositoryConnection } from "../../repositoryConnection/RepositoryConnection";
import PublishPlatformConnectionFactory from "../../repositoryConnection/PublishPlatformConnectionFactory";
import DigitalGardenSettings from "../../models/settings";

/**
 * Standalone "paste a GitHub URL, install a garden plugin" dialog, opened
 * by the "Install garden plugin from URL" command. The full management UI
 * lives in the settings tab's Plugins section.
 */
export class InstallPluginModal {
	modal: Modal;
	private view: ReturnType<typeof mount> | undefined;

	constructor(
		private app: App,
		private settings: DigitalGardenSettings,
	) {
		this.modal = new Modal(app);
		this.modal.titleEl.innerText = "Install Garden Plugin";
	}

	open = async () => {
		const connection =
			await PublishPlatformConnectionFactory.createPublishPlatformConnection(
				this.settings,
			);

		const manager = new GardenPluginManager(
			new RepositoryConnection(connection),
			this.settings,
		);

		this.modal.onClose = () => {
			if (this.view) {
				unmount(this.view);
				this.view = undefined;
			}
		};

		this.modal.onOpen = () => {
			this.modal.contentEl.empty();
			this.modal.contentEl.addClass("dg-garden-plugins-modal");

			this.view = mount(InstallPluginView, {
				target: this.modal.contentEl,
				props: {
					manager,
					settings: this.settings,
					close: () => this.modal.close(),
				},
			});
		};

		this.modal.open();
	};
}
