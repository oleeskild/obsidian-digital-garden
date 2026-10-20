import { MetadataCache, Notice } from "obsidian";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";
import DigitalGardenSettings from "../../models/settings";
import { PublishBranchMissingError } from "../../repositoryConnection/PublishBranchMissingError";
import { notifyPublishBranchMissing } from "../../repositoryConnection/publishBranchNotice";

/**
 * Push the garden's site settings (.env) to the repository, then persist the
 * plugin settings. Shared by the settings tab and the plugins deep link.
 */
export async function saveSiteSettingsAndUpdateEnv(
	metadataCache: MetadataCache,
	settings: DigitalGardenSettings,
	saveSettings: () => Promise<void>,
	touchedEnvKeys?: Set<string>,
) {
	new Notice("Updating settings...");
	let updateFailed = false;

	try {
		const gardenManager = new DigitalGardenSiteManager(
			metadataCache,
			settings,
		);
		await gardenManager.updateEnv(touchedEnvKeys);
	} catch (error) {
		if (error instanceof PublishBranchMissingError) {
			notifyPublishBranchMissing(error);
		} else {
			new Notice(
				"Failed to update settings. Make sure you have an internet connection.",
			);
		}
		updateFailed = true;
	}

	if (!updateFailed) {
		new Notice("Settings successfully updated!");
		await saveSettings();
	}

	return !updateFailed;
}
