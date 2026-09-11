import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import GardenPluginsView from "./GardenPluginsView.svelte";
import { GardenPluginManager } from "../../gardenPlugins/GardenPluginManager";
import DigitalGardenSettings from "../../models/settings";

export class GardenPluginsModal {
	modal: Modal;
	private view: ReturnType<typeof mount> | undefined;

	constructor(
		app: App,
		private manager: GardenPluginManager,
		private settings: DigitalGardenSettings,
		private saveSettings: () => Promise<void>,
		private applyNoteSettingsToSite: () => Promise<void>,
	) {
		this.modal = new Modal(app);
		this.modal.titleEl.innerText = "Garden Plugins";
	}

	open = () => {
		this.modal.onClose = () => {
			if (this.view) {
				unmount(this.view);
				this.view = undefined;
			}
		};

		this.modal.onOpen = () => {
			this.modal.contentEl.empty();
			this.modal.contentEl.addClass("dg-garden-plugins-modal");
			this.modal.modalEl.style.width = "min(760px, 92vw)";

			this.view = mount(GardenPluginsView, {
				target: this.modal.contentEl,
				props: {
					manager: this.manager,
					settings: this.settings,
					saveSettings: this.saveSettings,
					applyNoteSettingsToSite: this.applyNoteSettingsToSite,
				},
			});
		};

		this.modal.open();
	};
}
