import {
	GardenPluginManifest,
	InstalledGardenPlugin,
} from "src/models/gardenPlugin";

/**
 * Region resolution, mirroring the garden template's plugin loader: a
 * region (an exclusive render site like "navigation") is provided by the
 * first enabled plugin claiming it, in id order. Everything here is pure
 * so the settings UI and the installer share one source of truth.
 */

export function regionsOf(manifest: GardenPluginManifest): string[] {
	return Object.keys(manifest.regions ?? {});
}

/**
 * Which plugin provides each region: first enabled claimant by id.
 */
export function getRegionProviders(
	installed: InstalledGardenPlugin[],
): Record<string, string> {
	const providers: Record<string, string> = {};

	const enabled = [...installed]
		.filter((plugin) => plugin.enabled)
		.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));

	for (const plugin of enabled) {
		for (const region of regionsOf(plugin.manifest)) {
			providers[region] ??= plugin.manifest.id;
		}
	}

	return providers;
}

/**
 * Enabled plugins (other than the incoming one) that claim any of the
 * same regions as the incoming manifest — the plugins a user probably
 * wants disabled so the incoming plugin actually renders.
 */
export function getRegionConflicts(
	incoming: GardenPluginManifest,
	installed: InstalledGardenPlugin[],
): InstalledGardenPlugin[] {
	const incomingRegions = regionsOf(incoming);

	if (incomingRegions.length === 0) {
		return [];
	}

	return installed.filter(
		(plugin) =>
			plugin.enabled &&
			plugin.manifest.id !== incoming.id &&
			regionsOf(plugin.manifest).some((region) =>
				incomingRegions.includes(region),
			),
	);
}
