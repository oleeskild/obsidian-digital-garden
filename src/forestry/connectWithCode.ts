import type DigitalGardenSettings from "src/models/settings";
import { PublishPlatform } from "src/models/PublishPlatform";
import {
	ForestryApiError,
	IConnectExchangeResponse,
} from "src/forestry/ForestryApi";

export type ConnectCodeConnection = IConnectExchangeResponse["value"];

/** What the confirmation modal shows before a deep link connect is applied. */
export interface ConnectConfirmDetails {
	vaultName: string;
	/** The garden being connected, e.g. "quiet-grove.forestry.md". */
	gardenLabel: string;
	/**
	 * A sentence about what this vault publishes to today and what connecting
	 * replaces, or null when the vault has no garden yet.
	 */
	currentTarget: string | null;
}

export interface ConnectWithCodeDeps {
	vaultName: string;
	settings: DigitalGardenSettings;
	exchange: (code: string) => Promise<ConnectCodeConnection>;
	/** Resolves true only when the user explicitly chose to connect. */
	confirm: (details: ConnectConfirmDetails) => Promise<boolean>;
	saveSettings: () => Promise<void>;
	/**
	 * Tells Forestry.md which vault was connected, using the new key. Only
	 * called after the user confirmed; a failure never undoes the connect.
	 */
	reportVault: (apiKey: string, vaultName: string) => Promise<void>;
	notify: (message: string, timeout?: number) => void;
	logError: (message: string, error: unknown) => void;
}

export type ConnectOutcome = "connected" | "cancelled" | "failed";

export function gardenLabel(connection: {
	pageName: string;
	baseUrl: string;
}): string {
	return connection.baseUrl || connection.pageName;
}

/**
 * Describe what the vault publishes to right now, so the confirmation can
 * say what connecting will replace.
 */
export function describeCurrentTarget(
	settings: DigitalGardenSettings,
	connection: ConnectCodeConnection,
): string | null {
	if (settings.publishPlatform === PublishPlatform.ForestryMd) {
		const current = settings.forestrySettings;

		if (!current.apiKey) {
			return null;
		}

		// The exchange returns the garden's existing key, so a matching key
		// is the reliable signal; name and domain cover a key changed since.
		const isSameGarden =
			current.apiKey === connection.apiKey ||
			(!!current.forestryPageName &&
				current.forestryPageName === connection.pageName) ||
			(!!current.baseUrl && current.baseUrl === connection.baseUrl);

		if (isSameGarden) {
			return "This vault is already connected to this garden. Connecting again keeps it connected.";
		}

		const currentLabel =
			current.baseUrl ||
			current.forestryPageName ||
			"another Forestry.md garden";

		return `This vault currently publishes to ${currentLabel}. Connecting will replace that.`;
	}

	if (settings.githubUserName && settings.githubRepo) {
		return `This vault currently publishes to the GitHub repository ${settings.githubUserName}/${settings.githubRepo}. Connecting will switch it to Forestry.md.`;
	}

	return null;
}

/**
 * The `obsidian://digital-garden?connect=<code>` flow. The code is opaque,
 * so the garden is only known after exchanging it; the exchange result is
 * held in memory and nothing is written to settings until the user confirms
 * that this vault is the one to connect. Connecting never publishes.
 */
export async function connectWithCode(
	code: string,
	deps: ConnectWithCodeDeps,
): Promise<ConnectOutcome> {
	let connection: ConnectCodeConnection;

	try {
		connection = await deps.exchange(code);
	} catch (e) {
		deps.logError("Connect via deep link failed", e);

		if (e instanceof ForestryApiError && e.kind === "unauthorized") {
			deps.notify(
				"This connect link is invalid or has expired. Open your garden in the Forestry.md dashboard and click Connect again.",
				10000,
			);
		} else {
			deps.notify(
				"Couldn't reach Forestry.md to finish connecting. Check your connection and click Connect in the dashboard again.",
				10000,
			);
		}

		return "failed";
	}

	const label = gardenLabel(connection);

	const confirmed = await deps.confirm({
		vaultName: deps.vaultName,
		gardenLabel: label,
		currentTarget: describeCurrentTarget(deps.settings, connection),
	});

	if (!confirmed) {
		deps.notify(
			"Connect cancelled. Nothing in this vault was changed.",
			8000,
		);

		return "cancelled";
	}

	const settings = deps.settings;
	settings.publishPlatform = PublishPlatform.ForestryMd;
	settings.forestrySettings.apiKey = connection.apiKey;
	settings.forestrySettings.forestryPageName = connection.pageName;
	settings.forestrySettings.baseUrl = connection.baseUrl;
	await deps.saveSettings();

	try {
		await deps.reportVault(connection.apiKey, deps.vaultName);
	} catch (e) {
		// The dashboard just won't name the vault; the connection itself stands.
		deps.logError("Reporting the connected vault failed", e);
	}

	deps.notify(
		`Connected to ${label}. Mark a note with dg-publish and publish it when you're ready.`,
		10000,
	);

	return "connected";
}
