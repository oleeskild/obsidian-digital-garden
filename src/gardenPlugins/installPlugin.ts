import type { InstalledGardenPlugin } from "src/models/gardenPlugin";
import type DigitalGardenSettings from "src/models/settings";
import type {
	GardenPluginManager,
	RemoteGardenPlugin,
} from "./GardenPluginManager";
import { getRegionConflicts, regionsOf } from "./regions";
import { buildTriggeredNotice } from "./notices";

export interface InstallResult {
	remote: RemoteGardenPlugin;
	isUpdate: boolean;
	/** Plugins disabled so the new one could take over their region. */
	disabled: InstalledGardenPlugin[];
}

/**
 * Fetch, validate and install (or update) a plugin from a GitHub repo in
 * one step. There is no per-install confirmation: the user accepted the
 * risk once when turning community plugins on. Enabled plugins claiming
 * the same exclusive region are disabled in the same commit so the new
 * plugin actually renders.
 */
export async function installFromRepo(
	manager: GardenPluginManager,
	repoInput: string,
	installed: InstalledGardenPlugin[],
): Promise<InstallResult> {
	const remote = await manager.inspectRemotePlugin(repoInput);

	const existing = installed.find(
		(plugin) => plugin.manifest.id === remote.manifest.id,
	);
	const disabled = getRegionConflicts(remote.manifest, installed);

	await manager.install(
		remote,
		existing?.registryEntry,
		disabled.map((plugin) => plugin.manifest.id),
	);

	return { remote, isUpdate: !!existing, disabled };
}

export function installNotice(
	{ remote, isUpdate, disabled }: InstallResult,
	settings: Pick<DigitalGardenSettings, "publishPlatform">,
): string {
	const { name, version } = remote.manifest;
	let message = `${isUpdate ? "Updated" : "Installed"} ${name} ${version}.`;

	if (disabled.length > 0) {
		message += ` Disabled ${disabled
			.map((plugin) => plugin.manifest.name)
			.join(", ")} so ${name} provides ${regionsOf(remote.manifest).join(
			", ",
		)}.`;
	}

	return `${message} ${buildTriggeredNotice(settings)}`;
}
