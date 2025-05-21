import { Setting } from "obsidian";
import SettingView from "../SettingView";

export class ThemesSettings {
	settings: SettingView;
	settingsRootElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("settings-tab-content");

		this.initializeThemesHeader();
		this.initializeThemeSetting();
	}

	initializeThemesHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Quartz Themes")
			.setDesc(
				"Quartz Themes is a project that aims to regularly convert Obsidian themes to a Quartz-compatible format. Quartz Syncer will install the chosen theme in Quartz from the Quartz Themes repository.",
			)
			.setHeading();
	};

	initializeThemeSetting = () => {
		new Setting(this.settingsRootElement)
			.setName("Theme")
			.setDesc("Select the theme for your Quartz site.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.useThemes)
					.setValue(false)
					.setDisabled(true)
					.onChange((value) => {
						this.settings.settings.useThemes = value;
						this.settings.saveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-upcoming");
	};
}
