import DigitalGardenSettings from "src/models/settings";
import { PublishPlatform } from "src/models/PublishPlatform";

/**
 * Suffix for notices after a change was committed to the garden repo.
 * Committing triggers a site build (Forestry builds automatically;
 * self-hosted gardens build via their git-connected host), so tell the
 * user the change is on its way rather than "on the next build".
 */
export function buildTriggeredNotice(
	settings: Pick<DigitalGardenSettings, "publishPlatform">,
): string {
	if (settings.publishPlatform === PublishPlatform.ForestryMd) {
		return "Forestry is rebuilding your garden — the change will be live when the build finishes.";
	}

	return "A site build has been triggered — the change will be live when it finishes.";
}
