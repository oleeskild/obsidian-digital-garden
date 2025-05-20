import { Setting } from "obsidian";
import SettingView from "../SettingView";

export class FrontmatterSettings {
	settings: SettingView;
	private settingsRootElement: HTMLElement;

	constructor(settings: SettingView, settingsRootElement: HTMLElement) {
		this.settings = settings;
		this.settingsRootElement = settingsRootElement;

		this.initializeFrontmatterHeader();
		this.initializePublishFrontmatterKeySetting();
		this.initializeShowCreatedTimestampSetting();
		this.initializeShowUpdatedTimestampSetting();
		this.initializeShowPublishedTimestampSetting();
		this.initializeEnablePermalinkSetting();
		this.initializeIncludeAllFrontmatterSetting();
	}

	initializeFrontmatterHeader = () => {
		new Setting(this.settingsRootElement)
			.setName("Note properties (frontmatter)")
			.setDesc(
				"Quartz Syncer will apply these settings to your Quartz notes' frontmatter.",
			)
			.setHeading();
	};

	private initializePublishFrontmatterKeySetting() {
		new Setting(this.settingsRootElement)
			.setName("Publish key")
			.setDesc(
				'Note property key used to mark a note as eligible to publish. Quartz Syncer will ignore all notes without this property. By default "publish".',
			)
			.addText((text) =>
				text
					.setPlaceholder("publish")
					.setValue(this.settings.settings.publishFrontmatterKey)
					.onChange(async (value) => {
						if (value.length === 0) {
							value = "publish";
						}
						this.settings.settings.publishFrontmatterKey = value;
						await this.settings.saveSettings();
					}),
			);
	}

	private initializeShowCreatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include created timestamp")
			.setDesc("Include the created timestamp in your note's properties.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showCreatedTimestamp)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.showCreatedTimestamp = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					this.settings.settings.includeAllFrontmatter
						? "quartz-syncer-settings-overridden"
						: "quartz-syncer-settings-overridable"
				}`,
			);
	}

	private initializeShowUpdatedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include modified timestamp")
			.setDesc(
				"Include the modified timestamp in your note's properties.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showUpdatedTimestamp)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.showUpdatedTimestamp = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					this.settings.settings.includeAllFrontmatter
						? "quartz-syncer-settings-overridden"
						: "quartz-syncer-settings-overridable"
				}`,
			);
	}

	private initializeShowPublishedTimestampSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include published timestamp")
			.setDesc(
				"Include the published timestamp in your note's properties.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.showPublishedTimestamp)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.showPublishedTimestamp = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass(
				`${
					this.settings.settings.includeAllFrontmatter
						? "quartz-syncer-settings-overridden"
						: "quartz-syncer-settings-overridable"
				}`,
			);
	}

	private initializeIncludeAllFrontmatterSetting() {
		new Setting(this.settingsRootElement)
			.setName("Include all properties")
			.setDesc(
				"Include all note properties in the Quartz Syncer note. Enabling this will overrides other property settings to include all properties keys and values.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.includeAllFrontmatter = value;
						await this.settings.saveSettings();
					}),
			)
			.setClass("quartz-syncer-settings-overrider");
	}

	private initializeEnablePermalinkSetting() {
		new Setting(this.settingsRootElement)
			.setName("Enable permalinks")
			.setDesc(
				"Use the note's permalink as the Quartz note's URL if \"permalink\" is not in the frontmatter. This will override the default Quartz URL.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.settings.usePermalink)
					.setDisabled(this.settings.settings.includeAllFrontmatter)
					.onChange(async (value) => {
						this.settings.settings.usePermalink = value;
						await this.settings.saveSettings();
					}),
			);
	}
}
