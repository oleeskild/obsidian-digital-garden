import { PluginSettingTab, App, ButtonComponent } from "obsidian";
import DigitalGarden from "../../main";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import SettingView from "./SettingsView/SettingView";
import { UpdateGardenRepositoryModal } from "./UpdateGardenRepositoryModal";
import Logger from "js-logger";
import { TemplateUpdater } from "../repositoryConnection/TemplateManager";
import { PublishPlatform } from "src/models/PublishPlatform";
import { PublishBranchMissingError } from "src/repositoryConnection/PublishBranchMissingError";

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

			// Not awaited, so catch here: a missing publish branch now
			// rejects instead of being logged and swallowed.
			siteManager.updateEnv().catch((error) => {
				Logger.error("Initial settings sync failed", error);
			});
			this.plugin.settings.noteSettingsIsInitialized = true;
			this.plugin.saveData(this.plugin.settings);
		}
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		const siteManager = new DigitalGardenSiteManager(
			this.plugin.app.metadataCache,
			this.plugin.settings,
		);

		const settingView = new SettingView(
			this.app,
			containerEl,
			this.plugin.settings,
			async () => await this.plugin.saveSettings(),
			() => this.plugin.afterForestryConnected(),
		);
		const prModal = new UpdateGardenRepositoryModal(this.app);

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
				prModal.renderError(
					error instanceof PublishBranchMissingError
						? error.message
						: undefined,
				);
			}
		};

		await settingView.initialize(prModal);

		// Show template update section at the top for self-hosted (GitHub) platform
		if (
			this.plugin.settings.publishPlatform === PublishPlatform.SelfHosted
		) {
			settingView.renderCreatePr(prModal, handlePR, siteManager);

			settingView.renderPullRequestHistory(
				prModal,
				this.plugin.settings.prHistory.reverse().slice(0, 10),
			);
		}
	}
}
