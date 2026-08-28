import axios from "axios";
import { Base64 } from "js-base64";
import Logger from "js-logger";
import { RepositoryConnection } from "src/repositoryConnection/RepositoryConnection";
import PublishPlatformConnectionFactory from "src/repositoryConnection/PublishPlatformConnectionFactory";
import DigitalGardenSettings from "src/models/settings";
import {
	CommunityGardenPlugin,
	GardenPluginManifest,
	GardenPluginRegistry,
	GardenPluginRegistryEntry,
	InstalledGardenPlugin,
} from "src/models/gardenPlugin";
import {
	gardenPluginsPathBase,
	gardenPluginsRegistryPath,
} from "src/publisher/paths";
import {
	GARDEN_PLUGIN_MANIFEST_NAME,
	MAX_PLUGIN_FILE_SIZE,
	MAX_PLUGIN_TOTAL_SIZE,
	parseGitHubRepoInput,
	shouldSkipRepoFile,
	validateGardenPluginManifest,
} from "./manifest";

const logger = Logger.get("garden-plugin-manager");

export const COMMUNITY_PLUGINS_URL =
	"https://raw.githubusercontent.com/oleeskild/digitalgarden-plugins/main/community-plugins.json";

/** A plugin fetched and validated from its source repo, ready to install. */
export interface RemoteGardenPlugin {
	owner: string;
	repo: string;
	ref: string;
	manifest: GardenPluginManifest;
	/** Repo-relative source paths of every file to copy. */
	files: { path: string; size: number; sha: string }[];
}

type PathSettings = Pick<
	DigitalGardenSettings,
	"contentBaseDir" | "publishPlatform" | "githubToken"
>;

/**
 * Reads and mutates the garden plugin state of a user's garden repo: the
 * plugin directories under src/plugins/ and the user-owned registry file
 * src/plugins/plugins.json. The repo is the source of truth — nothing is
 * cached in plugin settings. Installation never executes plugin code; it
 * only copies files.
 */
export class GardenPluginManager {
	constructor(
		private userGardenConnection: RepositoryConnection,
		private settings: PathSettings,
		/** Overridable in tests; defaults to an unauthenticated GitHub connection. */
		private createSourceConnection: (
			owner: string,
			repo: string,
		) => RepositoryConnection = (owner, repo) =>
			new RepositoryConnection(
				PublishPlatformConnectionFactory.createGitHubConnection(
					owner,
					repo,
					PublishPlatformConnectionFactory.githubTokenFor(settings),
				),
			),
	) {}

	private get pluginsBase() {
		return gardenPluginsPathBase(this.settings);
	}

	private get registryPath() {
		return gardenPluginsRegistryPath(this.settings);
	}

	/** Read the registry, tolerating a missing or malformed file. */
	async getRegistry(): Promise<{
		registry: GardenPluginRegistry;
		sha?: string;
	}> {
		try {
			const file = await this.userGardenConnection.getFile(
				this.registryPath,
			);

			if (!file) {
				return { registry: { version: 1, plugins: {} } };
			}

			const parsed = JSON.parse(Base64.decode(file.content));

			if (
				typeof parsed?.plugins !== "object" ||
				parsed.plugins === null
			) {
				return { registry: { version: 1, plugins: {} }, sha: file.sha };
			}

			return {
				registry: { version: 1, ...parsed },
				sha: file.sha,
			};
		} catch {
			// Missing file is the normal state for gardens without plugins.
			return { registry: { version: 1, plugins: {} } };
		}
	}

	private serializeRegistry(registry: GardenPluginRegistry): string {
		return Base64.encode(JSON.stringify(registry, null, 2));
	}

	private async writeRegistry(
		mutate: (registry: GardenPluginRegistry) => void,
		message: string,
	): Promise<void> {
		const { registry, sha } = await this.getRegistry();

		mutate(registry);

		const response = await this.userGardenConnection.updateFile({
			path: this.registryPath,
			content: this.serializeRegistry(registry),
			sha,
			message,
		});

		if (!response) {
			throw new Error("Could not update the plugin registry");
		}
	}

	/**
	 * Enumerate installed plugins from the garden repo: every
	 * src/plugins/<id>/garden-plugin.json in the tree, merged with the
	 * registry's enabled state and settings.
	 */
	async listInstalled(): Promise<InstalledGardenPlugin[]> {
		const tree = await this.userGardenConnection.getContent("HEAD");

		if (!tree) {
			throw new Error("Could not read the garden repository");
		}

		const manifestPaths = (tree.tree ?? []).filter(
			(item): item is { path: string; type: string } =>
				typeof item.path === "string" &&
				item.type === "blob" &&
				item.path.startsWith(this.pluginsBase) &&
				item.path.endsWith(`/${GARDEN_PLUGIN_MANIFEST_NAME}`) &&
				item.path.slice(this.pluginsBase.length).split("/").length ===
					2,
		);

		const { registry } = await this.getRegistry();
		const plugins: InstalledGardenPlugin[] = [];

		for (const item of manifestPaths) {
			try {
				const file = await this.userGardenConnection.getFile(item.path);

				if (!file) {
					continue;
				}

				const { manifest, errors } = validateGardenPluginManifest(
					JSON.parse(Base64.decode(file.content)),
					{ allowFirstParty: true },
				);

				if (!manifest) {
					logger.warn(
						`Skipping invalid plugin manifest at ${
							item.path
						}: ${errors.join(", ")}`,
					);
					continue;
				}

				const registryEntry = registry.plugins[manifest.id];

				plugins.push({
					manifest,
					registryEntry,
					enabled: registryEntry?.enabled !== false,
					isFirstParty: manifest.id.startsWith("dg-"),
				});
			} catch (error) {
				logger.warn(
					`Skipping unreadable plugin at ${item.path}`,
					error,
				);
			}
		}

		return plugins.sort((a, b) =>
			a.manifest.id.localeCompare(b.manifest.id),
		);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		await this.writeRegistry(
			(registry) => {
				registry.plugins[id] = { ...registry.plugins[id], enabled };
			},
			`${enabled ? "Enable" : "Disable"} garden plugin ${id}`,
		);
	}

	async savePluginSettings(
		id: string,
		values: Record<string, string | number | boolean>,
	): Promise<void> {
		await this.writeRegistry((registry) => {
			registry.plugins[id] = {
				...registry.plugins[id],
				settings: values,
			};
		}, `Update settings for garden plugin ${id}`);
	}

	/** Fetch the community plugin list. Returns [] when unavailable. */
	async fetchCommunityPlugins(): Promise<CommunityGardenPlugin[]> {
		try {
			const response = await axios.get<CommunityGardenPlugin[]>(
				COMMUNITY_PLUGINS_URL,
			);

			if (!Array.isArray(response.data)) {
				return [];
			}

			return response.data.filter(
				(entry) => entry && entry.id && entry.repo,
			);
		} catch (error) {
			logger.info("Community plugin registry not reachable", error);

			return [];
		}
	}

	/**
	 * Fetch and validate a plugin from a GitHub repo without writing
	 * anything — the result is shown to the user for confirmation before
	 * {@link install}. Throws with a readable message on any problem.
	 */
	async inspectRemotePlugin(repoInput: string): Promise<RemoteGardenPlugin> {
		const parsed = parseGitHubRepoInput(repoInput);

		if (!parsed) {
			throw new Error(
				"Could not parse that as a GitHub repository. Expected something like https://github.com/user/repo",
			);
		}

		const source = this.createSourceConnection(parsed.owner, parsed.repo);

		const release = await source.getLatestRelease();
		let ref = release?.tag_name;

		if (!ref) {
			const info = await source.getRepositoryInfo();
			ref = info?.default_branch ?? "HEAD";
		}

		const tree = await source.getContent(ref);

		if (!tree) {
			throw new Error(
				`Could not read ${parsed.owner}/${parsed.repo}. Is it a public repository?`,
			);
		}

		const hasManifest = (tree.tree ?? []).some(
			(item) =>
				item.path === GARDEN_PLUGIN_MANIFEST_NAME &&
				item.type === "blob",
		);

		if (!hasManifest) {
			throw new Error(
				`${parsed.owner}/${parsed.repo} has no ${GARDEN_PLUGIN_MANIFEST_NAME} at its root, so it is not a garden plugin`,
			);
		}

		const manifestFile = await source.getFile(
			GARDEN_PLUGIN_MANIFEST_NAME,
			ref,
		);

		if (!manifestFile) {
			throw new Error(`Could not read ${GARDEN_PLUGIN_MANIFEST_NAME}`);
		}

		let manifestJson: unknown;

		try {
			manifestJson = JSON.parse(Base64.decode(manifestFile.content));
		} catch {
			throw new Error(`${GARDEN_PLUGIN_MANIFEST_NAME} is not valid JSON`);
		}

		const { manifest, errors } = validateGardenPluginManifest(manifestJson);

		if (!manifest) {
			throw new Error(`Invalid plugin manifest: ${errors.join("; ")}`);
		}

		const files = (tree.tree ?? [])
			.filter(
				(
					item,
				): item is {
					path: string;
					type: string;
					size?: number;
					sha: string;
				} =>
					typeof item.path === "string" &&
					typeof item.sha === "string" &&
					item.type === "blob" &&
					!shouldSkipRepoFile(item.path),
			)
			.map((item) => ({
				path: item.path,
				size: item.size ?? 0,
				sha: item.sha,
			}));

		const oversized = files.find(
			(file) => file.size > MAX_PLUGIN_FILE_SIZE,
		);

		if (oversized) {
			throw new Error(
				`${oversized.path} is larger than the ${
					MAX_PLUGIN_FILE_SIZE / 1024 / 1024
				} MB per-file limit`,
			);
		}

		const totalSize = files.reduce((sum, file) => sum + file.size, 0);

		if (totalSize > MAX_PLUGIN_TOTAL_SIZE) {
			throw new Error(
				`The plugin is larger than the ${
					MAX_PLUGIN_TOTAL_SIZE / 1024 / 1024
				} MB limit`,
			);
		}

		return {
			owner: parsed.owner,
			repo: parsed.repo,
			ref,
			manifest,
			files,
		};
	}

	private targetPathFor(id: string, sourcePath: string): string {
		return `${this.pluginsBase}${id}/${sourcePath}`;
	}

	/**
	 * Copy a validated remote plugin into the garden repo and record it in
	 * the registry — one atomic commit for the files plus registry. When an
	 * entry with previously installed files exists (update), files that no
	 * longer exist at the new ref are deleted in the same commit.
	 * `disablePluginIds` marks other plugins disabled in that same commit —
	 * used to hand over an exclusive region (e.g. navigation) to the
	 * incoming plugin.
	 */
	async install(
		remote: RemoteGardenPlugin,
		existingEntry?: GardenPluginRegistryEntry,
		disablePluginIds: string[] = [],
	): Promise<void> {
		const source = this.createSourceConnection(remote.owner, remote.repo);

		const additions: { path: string; content: string }[] = [];

		for (const file of remote.files) {
			const content = await source.getBlob(file.sha);

			if (content === undefined) {
				throw new Error(`Could not fetch ${file.path}`);
			}

			additions.push({
				path: this.targetPathFor(remote.manifest.id, file.path),
				content: content.replace(/\n/g, ""),
			});
		}

		const newFilePaths = additions.map((addition) => addition.path);

		const deletions = (existingEntry?.files ?? []).filter(
			(path) => !newFilePaths.includes(path),
		);

		const { registry } = await this.getRegistry();

		registry.plugins[remote.manifest.id] = {
			...existingEntry,
			repo: `${remote.owner}/${remote.repo}`,
			installedVersion: remote.manifest.version,
			installedRef: remote.ref,
			installedAt: new Date().toISOString(),
			enabled: existingEntry?.enabled !== false,
			files: newFilePaths,
		};

		for (const id of disablePluginIds) {
			if (id === remote.manifest.id) {
				continue;
			}

			registry.plugins[id] = { ...registry.plugins[id], enabled: false };
		}

		additions.push({
			path: this.registryPath,
			content: this.serializeRegistry(registry),
		});

		const action = existingEntry ? "Update" : "Install";

		await this.userGardenConnection.commitChanges({
			additions,
			deletions,
			message: `${action} garden plugin ${remote.manifest.id} (${remote.manifest.version})`,
		});
	}

	/**
	 * Delete a community plugin's files and registry entry in one commit.
	 * Falls back to enumerating the plugin directory when the registry has
	 * no file list (e.g. manually installed plugins).
	 */
	async uninstall(plugin: InstalledGardenPlugin): Promise<void> {
		const id = plugin.manifest.id;
		let files = plugin.registryEntry?.files;

		if (!files || files.length === 0) {
			const tree = await this.userGardenConnection.getContent("HEAD");

			files = (tree?.tree ?? [])
				.filter(
					(item): item is { path: string; type: string } =>
						typeof item.path === "string" &&
						item.type === "blob" &&
						item.path.startsWith(`${this.pluginsBase}${id}/`),
				)
				.map((item) => item.path);
		}

		const { registry } = await this.getRegistry();
		delete registry.plugins[id];

		await this.userGardenConnection.commitChanges({
			additions: [
				{
					path: this.registryPath,
					content: this.serializeRegistry(registry),
				},
			],
			deletions: files,
			message: `Uninstall garden plugin ${id}`,
		});
	}
}
