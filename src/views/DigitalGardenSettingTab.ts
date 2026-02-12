import { PluginSettingTab, App } from "obsidian";
import DigitalGarden from "../../main";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import SettingView from "./SettingsView/SettingView";
import { UpdateGardenRepositoryModal } from "./UpdateGardenRepositoryModal";

export class DigitalGardenSettingTab extends PluginSettingTab {
	plugin: DigitalGarden;

	constructor(app: App, plugin: DigitalGarden) {
		super(app, plugin);
		this.plugin = plugin;

		if (!this.plugin.settings.noteSettingsIsInitialized) {
			const siteManager = new DigitalGardenSiteManager(
				this.app.metadataCache,
				this.plugin.settings,
			);
			siteManager.updateEnv();
			this.plugin.settings.noteSettingsIsInitialized = true;
			this.plugin.saveData(this.plugin.settings);
		}
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		const settingView = new SettingView(
			this.app,
			containerEl,
			this.plugin.settings,
			async () => await this.plugin.saveData(this.plugin.settings),
		);
		const prModal = new UpdateGardenRepositoryModal(this.app);
		await settingView.initialize(prModal);
	}
}
