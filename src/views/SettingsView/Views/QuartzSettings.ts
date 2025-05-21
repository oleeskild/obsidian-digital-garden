import { Setting } from "obsidian";
import SettingView from "../SettingView";

export class QuartzSettings {
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;

		this.initializeQuartzHeader();
		this.initializeQuartzContentFolder();
		this.initializeUseFullImageResolutionSetting();
		this.initializeApplyEmbedsSetting();
	}

	initializeQuartzHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Quartz")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes.",
			)
			.setHeading();
	};

	private initializeUseFullImageResolutionSetting() {
		new Setting(this.settingsRootElement)
			.setName("Use full image resolution")
			.setDesc(
				"By default, Quartz Syncer will use lower resolution images to save space. If you want to use the full resolution blob, enable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useFullResolutionImages)
					.onChange(async (value) => {
						this.settings.settings.useFullResolutionImages = value;
						await this.settings.saveSettings();
					}),
			);
	}

	private initializeApplyEmbedsSetting() {
		new Setting(this.settingsRootElement)
			.setName("Apply embeds")
			.setDesc(
				"By default, Quartz Syncer will apply embeds directly to your notes. If you want to let Quartz embeds, disable this setting.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.applyEmbeds)
					.onChange(async (value) => {
						this.settings.settings.applyEmbeds = value;
						await this.settings.saveSettings();
					}),
			);
	}

	private initializeQuartzContentFolder() {
		new Setting(this.settingsRootElement)
			.setName("Content folder")
			.setDesc(
				'The folder in your Quartz repository where Quartz Syncer should store your notes. By default "content"',
			)
			.addText((text) =>
				text
					.setPlaceholder("content")
					.setValue(this.settings.settings.contentFolder)
					.onChange(async (value) => {
						this.settings.settings.contentFolder = value;
						await this.settings.saveSettings();
					}),
			);
	}
}
