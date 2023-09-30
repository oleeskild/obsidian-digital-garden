import { PluginSettingTab, App, ButtonComponent } from "obsidian";
import DigitalGarden from "../../main";
import DigitalGardenSiteManager from "src/publisher/DigitalGardenSiteManager";
import SettingView from "./SettingsView/SettingView";
import { UpdateGardenRepositoryModal } from "./SettingsModal";

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

		const handlePR = async (button: ButtonComponent) => {
			prModal.renderLoading();
			button.setDisabled(true);

			try {
				const siteManager = new DigitalGardenSiteManager(
					this.plugin.app.metadataCache,
					this.plugin.settings,
				);

				const prUrl =
					await siteManager.createPullRequestWithSiteChanges();

				if (prUrl) {
					this.plugin.settings.prHistory.push(prUrl);
					await this.plugin.saveSettings();
				}
				prModal.renderSuccess(prUrl);
				button.setDisabled(false);
			} catch (error) {
				prModal.renderError();
			}
		};
		settingView.renderCreatePr(prModal, handlePR);

		settingView.renderPullRequestHistory(
			prModal,
			this.plugin.settings.prHistory.reverse().slice(0, 10),
		);
	}
}
