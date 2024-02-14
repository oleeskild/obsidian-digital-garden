import { PluginSettingTab, App, ButtonComponent } from "obsidian";
import QuartzSyncer from "../../main";
import QuartzSyncerSiteManager from "src/repositoryConnection/QuartzSyncerSiteManager";
import SettingView from "./SettingsView/SettingView";
import { UpdateSyncerRepositoryModal } from "./UpdateSyncerRepositoryModal";
import Logger from "js-logger";
import { TemplateUpdater } from "../repositoryConnection/TemplateManager";

export class QuartzSyncerSettingTab extends PluginSettingTab {
	plugin: QuartzSyncer;

	constructor(app: App, plugin: QuartzSyncer) {
		super(app, plugin);
		this.plugin = plugin;

		if (!this.plugin.settings.noteSettingsIsInitialized) {
			const siteManager = new QuartzSyncerSiteManager(
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

		const siteManager = new QuartzSyncerSiteManager(
			this.plugin.app.metadataCache,
			this.plugin.settings,
		);

		const settingView = new SettingView(
			this.app,
			containerEl,
			this.plugin.settings,
			async () => await this.plugin.saveData(this.plugin.settings),
		);
		const prModal = new UpdateSyncerRepositoryModal(this.app);
		await settingView.initialize(prModal);

		const handlePR = async (
			button: ButtonComponent,
			updater: TemplateUpdater,
		) => {
			prModal.renderLoading();
			button.setDisabled(true);

			if (!updater) {
				prModal.renderSuccess("");
				button.setDisabled(false);

				return;
			}

			try {
				Logger.time("update");

				const prUrl = await updater.updateTemplate();
				Logger.timeEnd("update");

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
		settingView.renderCreatePr(prModal, handlePR, siteManager);

		settingView.renderPullRequestHistory(
			prModal,
			this.plugin.settings.prHistory.reverse().slice(0, 10),
		);
	}
}
