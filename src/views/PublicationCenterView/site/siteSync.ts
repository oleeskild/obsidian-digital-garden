import { Base64 } from "js-base64";
import type { Vault } from "obsidian";
import type DigitalGardenSettings from "../../../models/settings";
import type DigitalGardenSiteManager from "../../../repositoryConnection/DigitalGardenSiteManager";
import PublishPlatformConnectionFactory from "../../../repositoryConnection/PublishPlatformConnectionFactory";
import { RepositoryConnection } from "../../../repositoryConnection/RepositoryConnection";
import { envPath, sitePath } from "../../../publisher/paths";
import { uploadFavicon, uploadLogo } from "../../../publisher/siteAssets";
import {
	generateEnvValues,
	parseEnvValues,
	stringifyEnvValues,
} from "../../../utils/envSettings";
import { PublishPlatform } from "../../../models/PublishPlatform";
import { applySiteValue, SITE_FIELDS } from "./siteFields";
import type { SiteFieldDef, ThemeInfo } from "./siteFields";
import { pullSiteValues, pullWholeValue } from "./siteChanges";
import type { SiteChange } from "./siteChanges";

export type SiteAsset = "logo" | "favicon";

/** The site's current .env values. A missing file means no values yet. */
export async function loadRemoteSiteValues(
	siteManager: DigitalGardenSiteManager,
	settings: DigitalGardenSettings,
): Promise<Record<string, string>> {
	const connection = await siteManager.getUserGardenConnection();
	const file = await connection.getFile(envPath(settings));

	return parseEnvValues(Base64.decode(file?.content ?? ""));
}

export const localSiteValues = (settings: DigitalGardenSettings) =>
	stringifyEnvValues(generateEnvValues(settings));

const navigationPath = (settings: DigitalGardenSettings) =>
	sitePath(settings, "/_data/navigationOrder.json");

type NavigationOrder = Record<string, string[]>;

/** A navigation order as comparable JSON; "" for the default order. */
export const navigationJson = (order: NavigationOrder | undefined) =>
	order && Object.keys(order).length > 0 ? JSON.stringify(order) : "";

/**
 * The site's navigation order as JSON. The connection can't tell a missing
 * file from a failed request, so this only runs after the .env was read.
 */
async function loadRemoteNavigation(
	siteManager: DigitalGardenSiteManager,
	settings: DigitalGardenSettings,
): Promise<string> {
	const connection = await siteManager.getUserGardenConnection();

	try {
		const file = await connection.getFile(navigationPath(settings));

		return navigationJson(
			file?.content ? JSON.parse(Base64.decode(file.content)) : undefined,
		);
	} catch {
		return "";
	}
}

/** Adopts the site's navigation order, unless it's an unpublished edit. */
async function pullNavigation(
	siteManager: DigitalGardenSiteManager,
	settings: DigitalGardenSettings,
): Promise<boolean> {
	const remote = await loadRemoteNavigation(siteManager, settings);

	const { adopt, baseline } = pullWholeValue(
		navigationJson(settings.navigationOrder),
		remote,
		settings.siteNavigationBaseline,
	);

	if (adopt) {
		settings.navigationOrder = remote ? JSON.parse(remote) : undefined;
	}

	const changed = adopt || settings.siteNavigationBaseline !== baseline;
	settings.siteNavigationBaseline = baseline;

	return changed;
}

/** The navigation order, when it differs from the site's. */
export function navigationChange(
	settings: DigitalGardenSettings,
): SiteChange[] {
	const baseline = settings.siteNavigationBaseline;
	const local = navigationJson(settings.navigationOrder);

	if (baseline === undefined || local === baseline) return [];

	return [
		{
			id: "navigation",
			keys: [],
			section: "navigation",
			label: "Navigation order",
			local,
			remote: baseline,
			remoteValues: {},
		},
	];
}

/**
 * Reads the site's .env and adopts its values into local settings, so
 * changes made elsewhere (another device, the dashboard, GitHub) show up
 * here. Returns whether settings changed; the caller saves.
 */
export async function pullFromSite(
	siteManager: DigitalGardenSiteManager,
	settings: DigitalGardenSettings,
	themes: ThemeInfo[] = [],
): Promise<boolean> {
	const remote = await loadRemoteSiteValues(siteManager, settings);
	let changed = false;

	// Assume the logo and favicon on the site are the current ones the
	// first time; only later path changes count.
	if (!settings.siteAssetBaseline) {
		settings.siteAssetBaseline = {
			logoPath: settings.logoPath,
			faviconPath: settings.faviconPath,
		};
		changed = true;
	}

	if (await pullNavigation(siteManager, settings)) changed = true;

	// No .env yet: the site has nothing to pull, and everything set here
	// is pending.
	if (Object.keys(remote).length === 0) return changed;

	const { adopt, baseline } = pullSiteValues(
		siteFieldsFor(settings),
		localSiteValues(settings),
		remote,
		settings.siteSettingsBaseline,
	);

	for (const [key, value] of Object.entries(adopt)) {
		applySiteValue(settings, key, value, themes);
	}

	if (
		Object.keys(adopt).length > 0 ||
		JSON.stringify(baseline) !==
			JSON.stringify(settings.siteSettingsBaseline ?? {})
	) {
		settings.siteSettingsBaseline = baseline;
		changed = true;
	}

	return changed;
}

/** The fields that apply to this garden's hosting track. */
export function siteFieldsFor(settings: DigitalGardenSettings): SiteFieldDef[] {
	const selfHosted = settings.publishPlatform === PublishPlatform.SelfHosted;

	return SITE_FIELDS.filter((f) => selfHosted || !f.selfHostedOnly);
}

/** Why the chosen theme and light/dark mode can't be published together. */
export function themeBlockReason(
	settings: DigitalGardenSettings,
): string | undefined {
	const theme = JSON.parse(settings.theme);

	if (theme.name === "default" || !Array.isArray(theme.modes)) return;

	if (theme.modes.includes(settings.baseTheme)) return;

	return `${theme.name} has no ${settings.baseTheme} mode. Pick ${
		theme.modes[0] ?? "another"
	} or another theme.`;
}

const ASSET_LABEL: Record<SiteAsset, string> = {
	logo: "Logo",
	favicon: "Favicon",
};

const assetPath = (settings: DigitalGardenSettings, asset: SiteAsset) =>
	asset === "logo" ? settings.logoPath : settings.faviconPath;

/**
 * Logo and favicon are files on the site. They count as changed when their
 * vault path differs from the one last uploaded.
 */
export function assetChanges(settings: DigitalGardenSettings): SiteChange[] {
	const baseline = settings.siteAssetBaseline;

	if (!baseline) return [];

	return (["logo", "favicon"] as SiteAsset[])
		.filter(
			(asset) => assetPath(settings, asset) !== baseline[`${asset}Path`],
		)
		.map((asset) => ({
			id: `asset:${asset}`,
			keys: [],
			section: "appearance" as const,
			label: ASSET_LABEL[asset],
			local: assetPath(settings, asset),
			remote: baseline[`${asset}Path`],
			remoteValues: {},
		}));
}

export const assetOf = (change: SiteChange): SiteAsset | null =>
	change.id.startsWith("asset:")
		? (change.id.slice("asset:".length) as SiteAsset)
		: null;

/**
 * Writes the chosen site changes: .env keys in one commit (merged into the
 * site's current file), then any logo or favicon upload. Updates the sync
 * baselines; the caller saves settings.
 */
export async function publishSiteChanges(options: {
	siteManager: DigitalGardenSiteManager;
	settings: DigitalGardenSettings;
	vault: Vault;
	changes: SiteChange[];
}) {
	const { siteManager, settings, vault, changes } = options;

	const keys = new Set(changes.flatMap((c) => c.keys));
	const assets = changes.map(assetOf).filter((a): a is SiteAsset => !!a);

	if (keys.size > 0) {
		await siteManager.updateEnv(keys);
	}

	if (changes.some((c) => c.id === "navigation")) {
		await publishNavigation(siteManager, settings);
	}

	if (assets.length === 0) return;

	const connection =
		await PublishPlatformConnectionFactory.createPublishPlatformConnection(
			settings,
		);

	const branch = await new RepositoryConnection(
		connection,
	).getPublishBranch();

	const target = [
		connection.octoKit,
		connection.userName,
		connection.pageName,
		branch,
	] as const;

	for (const asset of assets) {
		if (asset === "logo") await uploadLogo(vault, settings, ...target);
		else await uploadFavicon(vault, settings, ...target);

		settings.siteAssetBaseline = {
			logoPath: settings.siteAssetBaseline?.logoPath ?? "",
			faviconPath: settings.siteAssetBaseline?.faviconPath ?? "",
			[`${asset}Path`]: assetPath(settings, asset),
		};
	}
}

/** Writes the local navigation order to the site, or removes it for the default. */
async function publishNavigation(
	siteManager: DigitalGardenSiteManager,
	settings: DigitalGardenSettings,
) {
	const connection = await siteManager.getUserGardenConnection();
	const path = navigationPath(settings);
	const local = navigationJson(settings.navigationOrder);

	const current = await connection.getFile(path).catch(() => undefined);

	if (local) {
		await connection.updateFile({
			path,
			content: Base64.encode(
				JSON.stringify(settings.navigationOrder, null, 2),
			),
			message: "Update navigation order",
			sha: current?.sha,
		});
	} else if (current?.sha) {
		await connection.deleteFile(path, { sha: current.sha });
	}
	settings.siteNavigationBaseline = local;
}
