import { Setting } from "obsidian";
import SettingView from "../SettingView";
import { isPluginEnabled } from "obsidian-dataview";

export class IntegrationSettings {
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;

		this.initializePluginIntegrationHeader();
		this.initializeDataviewSetting();
		this.initializeExcalidrawSetting();
	}

	initializePluginIntegrationHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Plugin integration")
			.setDesc(
				"Quartz Syncer will use these Obsidian plugins with your Quartz notes.",
			)
			.setHeading();
	};

	private initializeDataviewSetting() {
		const dataviewEnabled = isPluginEnabled(this.settings.app);

		new Setting(this.settingsRootElement)
			.setName("Enable Dataview integration")
			.setDesc(
				"Converts Dataview queries into Quartz-compatible markdown.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.settings.settings.useDataview && dataviewEnabled,
					)
					.setDisabled(!dataviewEnabled)
					.onChange(async (value) => {
						this.settings.settings.useDataview =
							value && dataviewEnabled;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					dataviewEnabled
						? "quartz-syncer-settings-enabled"
						: "quartz-syncer-settings-disabled"
				}`,
			);
	}

	private initializeExcalidrawSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable Excalidraw integration")
			.setDesc(
				"Converts Excalidraw drawings into Quartz-compatible format.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useExcalidraw)
					.setValue(false)
					.setDisabled(true)
					.onChange(async (value) => {
						this.settings.settings.useExcalidraw = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-upcoming");
	}
}
