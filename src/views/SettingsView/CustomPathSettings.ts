import { Setting } from "obsidian";
import SettingView from "./SettingView";

export function initializeCustomPathSettings(
	settings: SettingView,
	target: HTMLElement,
) {
	const addPath = (
		name: string,
		description: string,
		placeholder: string,
		key:
			| "notesDirectory"
			| "assetsDirectory"
			| "siteDirectory"
			| "settingsFilePath",
	) => {
		new Setting(target)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(settings.settings[key] ?? "")
					.onChange(async (value) => {
						settings.settings[key] = value;
						await settings.saveSettings();
					}),
			);
	};

	addPath(
		"Notes directory (advanced)",
		"Root-relative directory for published notes. Empty uses the template default.",
		"src/site/notes",
		"notesDirectory",
	);

	addPath(
		"Assets directory (advanced)",
		"Root-relative directory for published user assets. Empty uses the template default.",
		"src/site/img/user",
		"assetsDirectory",
	);

	addPath(
		"Site directory (advanced)",
		"Root-relative directory for site-level files such as the logo and navigation order.",
		"src/site",
		"siteDirectory",
	);

	addPath(
		"Settings file path (advanced)",
		"Root-relative path for generated garden settings. Empty uses .env.",
		".env",
		"settingsFilePath",
	);
}
