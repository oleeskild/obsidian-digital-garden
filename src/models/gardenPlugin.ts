/**
 * Types for the garden plugin system. The formats are defined by the garden
 * template repo (oleeskild/digitalgarden): see docs/PLUGINS.md (manifest)
 * and docs/PLUGIN_INSTALLER_SPEC.md (registry, installer contract) there.
 */

/** One user-facing setting declared by a plugin manifest. */
export interface GardenPluginSettingEntry {
	key: string;
	name: string;
	description?: string;
	type: "text" | "boolean" | "number" | "select";
	default?: string | number | boolean;
	options?: string[];
	/** Env var consulted by the template when no registry value is stored. */
	env?: string;
}

/** The garden-plugin.json manifest at the root of a plugin. */
export interface GardenPluginManifest {
	id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	minTemplateVersion?: string;
	hooks?: string;
	slots?: Record<string, string | string[]>;
	/** Exclusive render sites (e.g. "navigation") — one provider wins. */
	regions?: Record<string, string>;
	styles?: string[];
	scripts?: string[];
	assets?: string[];
	settings?: GardenPluginSettingEntry[];
	noteSettings?: string[];
}

/** Per-plugin state stored in src/plugins/plugins.json in the garden repo. */
export interface GardenPluginRegistryEntry {
	repo?: string;
	installedVersion?: string;
	installedRef?: string;
	installedAt?: string;
	enabled?: boolean;
	settings?: Record<string, string | number | boolean>;
	/** Exact repo paths written at install time, used for clean uninstall. */
	files?: string[];
}

/** The user-owned state file src/plugins/plugins.json. */
export interface GardenPluginRegistry {
	version: number;
	plugins: Record<string, GardenPluginRegistryEntry>;
}

/** An installed plugin: its manifest merged with its registry state. */
export interface InstalledGardenPlugin {
	manifest: GardenPluginManifest;
	registryEntry?: GardenPluginRegistryEntry;
	enabled: boolean;
	/** Shipped with the template (dg-*), managed by template updates. */
	isFirstParty: boolean;
}

/** One entry in the community registry's community-plugins.json. */
export interface CommunityGardenPlugin {
	id: string;
	name: string;
	author: string;
	description: string;
	/** GitHub repo as owner/name. */
	repo: string;
	screenshot?: string;
}
