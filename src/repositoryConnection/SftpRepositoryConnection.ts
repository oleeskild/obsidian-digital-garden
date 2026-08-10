import fs from "fs/promises";
import os from "os";
import path from "path";
import posixPath from "path/posix";
import { createHash } from "crypto";
import type SftpClientType from "ssh2-sftp-client";
import { Platform } from "obsidian";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import DigitalGardenSettings, {
	DEFAULT_SFTP_PRIVATE_KEY_PATH,
} from "src/models/settings";
import { generateBlobHash, generateBlobHashFromBase64 } from "src/utils/utils";
import { imagePathBase, notePathBase } from "src/publisher/paths";
import {
	publicationManifestStore,
	type PublicationManifest,
} from "src/publisher/PublicationManifestStore";
import type {
	IPutPayload,
	IRepositoryConnection,
	IRepositoryFile,
	RepositoryProgress,
	IRepositoryTree,
} from "./RepositoryConnection";

/** Repository-compatible storage backed by the SFTP subsystem of an SSH server. */
export class SftpRepositoryConnection implements IRepositoryConnection {
	constructor(private settings: DigitalGardenSettings) {}

	validateSettings(): void {
		if (!Platform.isDesktop)
			throw new Error("SFTP publishing is only available on desktop");

		if (!this.settings.sftpHost || !this.settings.sftpUsername)
			throw new Error("SFTP host and username are required");

		if (!this.settings.sftpRemoteRoot)
			throw new Error("An SFTP remote garden folder is required");
	}

	usesPublicationManifest(): boolean {
		return true;
	}

	async clearPublicationManifest(): Promise<void> {
		await publicationManifestStore.remove("sftp");
	}

	getRepositoryName(): string {
		return `${this.settings.sftpUsername}@${
			this.settings.sftpHost
		}:${this.root()}`;
	}

	async getContent(
		_branch: string,
		onProgress?: (progress: RepositoryProgress) => void,
	): Promise<IRepositoryTree> {
		return this.withClient(async (client) => {
			onProgress?.({
				completed: 0,
				message: "Loading hash manifest…",
			});
			const manifest = await this.readManifest();

			if (manifest) return this.manifestToTree(manifest);

			onProgress?.({
				completed: 0,
				message: "Building hash manifest for the first time…",
			});
			const tree: IRepositoryTree["tree"] = [];
			const progress = { completed: 0 };

			const roots = new Set([
				notePathBase(this.settings),
				imagePathBase(this.settings),
			]);

			for (const contentRoot of roots) {
				const relative = contentRoot.replace(/\/+$/, "");
				await this.walk(client, relative, tree, progress, onProgress);
			}

			await this.writeManifest(this.treeToManifest(tree));

			return { tree };
		});
	}

	async getFile(filePath: string): Promise<IRepositoryFile | undefined> {
		return this.withClient(async (client) => {
			const remotePath = this.resolve(filePath);

			if (!(await client.exists(remotePath))) return undefined;

			const content = await client.get(remotePath);
			const buffer = this.toBuffer(content, filePath);
			const encoded = buffer.toString("base64");

			return {
				type: "file",
				path: filePath,
				content: encoded,
				sha: generateBlobHashFromBase64(encoded),
			};
		});
	}

	async deleteFile(filePath: string): Promise<boolean> {
		return this.withClient(async (client) => {
			const remotePath = this.resolve(filePath);

			if (!(await client.exists(remotePath))) return false;
			await client.delete(remotePath);
			await this.removeManifestPaths(client, [filePath]);

			return true;
		});
	}

	async updateFile(payload: IPutPayload): Promise<void> {
		await this.withClient(async (client) => {
			const content = Buffer.from(payload.content, "base64");
			await this.put(client, payload.path, content);

			if (this.isManagedPath(payload.path)) {
				const manifest = await this.getOrBuildManifest(client);

				manifest.files[payload.path] = this.hashContent(
					payload.path,
					content,
				);
				await this.writeManifest(manifest);
			}
		});
	}

	async updateFiles(
		files: CompiledPublishFile[],
		remoteImageHashes: Record<string, string> = {},
		onProgress?: (completed: number, currentPath: string) => void,
	): Promise<void> {
		await this.withClient(async (client) => {
			const manifest = await this.getOrBuildManifest(client);
			const uploadedAssets = new Set<string>();

			let completed = 0;

			for (const file of files) {
				const [content, assets] = file.getCompiledFile();

				const notePath = notePathBase(this.settings) + file.getPath();
				const noteContent = Buffer.from(content, "utf-8");
				await this.put(client, notePath, noteContent);
				manifest.files[notePath] = generateBlobHash(content);

				for (const asset of assets.images) {
					const relative = asset.path.replace(/^\/?img\/user\//, "");

					if (uploadedAssets.has(relative)) continue;
					uploadedAssets.add(relative);

					if (
						asset.localHash &&
						remoteImageHashes[relative] === asset.localHash
					)
						continue;

					const assetPath = imagePathBase(this.settings) + relative;
					const assetContent = Buffer.from(asset.content, "base64");
					await this.put(client, assetPath, assetContent);

					manifest.files[assetPath] =
						asset.localHash ??
						generateBlobHashFromBase64(asset.content);
				}

				completed++;
				onProgress?.(completed, file.getPath());
			}

			await this.writeManifest(manifest);
		});
	}

	async deleteFiles(paths: string[]): Promise<void> {
		await this.withClient(async (client) => {
			for (const filePath of paths) {
				const remotePath = this.resolve(filePath);

				if (await client.exists(remotePath))
					await client.delete(remotePath);
			}

			await this.removeManifestPaths(client, paths);
		});
	}

	async getLatestRelease() {
		return undefined;
	}
	async getLatestCommit() {
		return undefined;
	}
	async getRepositoryInfo() {
		return this.withClient(async (client) => {
			const root = this.root();

			try {
				// Some NAS SFTP implementations expose virtual mount points that
				// can be listed but do not support stat/_xstat. Publishing only
				// requires directory access, so test that operation directly.
				await client.list(root);
			} catch (error) {
				const detail =
					error instanceof Error ? error.message : String(error);

				throw new Error(
					`Cannot list remote garden folder ${root}: ${detail}`,
				);
			}

			return { default_branch: "sftp" };
		});
	}
	async createBranch(_branchName: string, _sha: string): Promise<void> {}
	async createPullRequest(_input: {
		title: string;
		head: string;
		base: string;
		body: string;
	}): Promise<string> {
		return "";
	}

	private async withClient<T>(
		operation: (client: SftpClientType) => Promise<T>,
	) {
		const { default: SftpClient } = await import("ssh2-sftp-client");
		const client = new SftpClient();

		const privateKeyPath = this.expandHome(
			this.settings.sftpPrivateKeyPath.trim() ||
				DEFAULT_SFTP_PRIVATE_KEY_PATH,
		);
		const expectedFingerprint = this.settings.sftpHostKeyFingerprint.trim();
		let privateKey: Buffer | undefined;

		try {
			privateKey = await fs.readFile(privateKeyPath);
		} catch (error) {
			if (!this.settings.sftpPassword) throw error;
		}

		try {
			await client.connect({
				host: this.settings.sftpHost.trim(),
				port: this.settings.sftpPort || 22,
				username: this.settings.sftpUsername.trim(),
				password: privateKey
					? undefined
					: this.settings.sftpPassword || undefined,
				privateKey,
				passphrase: this.settings.sftpPrivateKeyPassphrase || undefined,
				hostVerifier: expectedFingerprint
					? (key: Buffer) =>
							expectedFingerprint === this.fingerprint(key)
					: undefined,
			});

			return await operation(client);
		} finally {
			await client.end().catch(() => undefined);
		}
	}

	private root(): string {
		const root = this.settings.sftpRemoteRoot.trim().replace(/\\/g, "/");

		if (!root.startsWith("/"))
			throw new Error(
				"SFTP remote garden folder must be an absolute path",
			);

		return posixPath.normalize(root);
	}

	private resolve(relativePath: string): string {
		const root = this.root();
		const relative = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
		const destination = posixPath.resolve(root, relative);
		const fromRoot = posixPath.relative(root, destination);

		if (
			fromRoot === ".." ||
			fromRoot.startsWith("../") ||
			posixPath.isAbsolute(fromRoot)
		)
			throw new Error(`Path escapes SFTP garden folder: ${relativePath}`);

		return destination;
	}

	private async put(
		client: SftpClientType,
		relativePath: string,
		content: Buffer,
	) {
		const destination = this.resolve(relativePath);
		await client.mkdir(posixPath.dirname(destination), true);
		await client.put(content, destination);
	}

	private async walk(
		client: SftpClientType,
		relative: string,
		tree: IRepositoryTree["tree"],
		progress: { completed: number },
		onProgress?: (progress: RepositoryProgress) => void,
	): Promise<void> {
		const remotePath = this.resolve(relative);

		onProgress?.({
			completed: progress.completed,
			message: `Scanning remote folder: ${relative}`,
		});

		if (!(await client.exists(remotePath))) return;

		const entries = await client.list(remotePath);

		entries.sort((a, b) =>
			a.name.localeCompare(b.name, undefined, {
				numeric: true,
				sensitivity: "base",
			}),
		);

		for (const entry of entries) {
			const child = relative ? `${relative}/${entry.name}` : entry.name;

			if (entry.type === "d")
				await this.walk(client, child, tree, progress, onProgress);
			else if (entry.type === "-") {
				onProgress?.({
					completed: progress.completed,
					message: `Reading remote file: ${child}`,
				});
				const content = await client.get(this.resolve(child));
				const buffer = this.toBuffer(content, child);

				tree.push({
					path: child,
					type: "blob",
					sha: child.startsWith(notePathBase(this.settings))
						? generateBlobHash(buffer.toString("utf-8"))
						: generateBlobHashFromBase64(buffer.toString("base64")),
				});
				progress.completed++;
			}
		}
	}

	private async readManifest(): Promise<PublicationManifest | undefined> {
		const manifest = await publicationManifestStore.read(
			"sftp",
			this.manifestTarget(),
		);

		if (!manifest) return undefined;

		manifest.files = Object.fromEntries(
			Object.entries(manifest.files).filter(([filePath]) =>
				this.isManagedPath(filePath),
			),
		);

		return manifest;
	}

	private async getOrBuildManifest(
		client: SftpClientType,
	): Promise<PublicationManifest> {
		const existing = await this.readManifest();

		if (existing) return existing;

		const tree: IRepositoryTree["tree"] = [];
		const progress = { completed: 0 };

		for (const contentRoot of new Set([
			notePathBase(this.settings),
			imagePathBase(this.settings),
		])) {
			await this.walk(
				client,
				contentRoot.replace(/\/+$/, ""),
				tree,
				progress,
			);
		}

		return this.treeToManifest(tree);
	}

	private async writeManifest(manifest: PublicationManifest): Promise<void> {
		await publicationManifestStore.write("sftp", manifest);
	}

	private async removeManifestPaths(
		client: SftpClientType,
		paths: string[],
	): Promise<void> {
		const managedPaths = paths.filter((filePath) =>
			this.isManagedPath(filePath),
		);

		if (managedPaths.length === 0) return;

		const manifest = await this.getOrBuildManifest(client);

		for (const filePath of managedPaths) delete manifest.files[filePath];
		await this.writeManifest(manifest);
	}

	private manifestToTree(manifest: PublicationManifest): IRepositoryTree {
		return {
			tree: Object.entries(manifest.files)
				.sort(([a], [b]) =>
					a.localeCompare(b, undefined, { numeric: true }),
				)
				.map(([filePath, sha]) => ({
					path: filePath,
					type: "blob",
					sha,
				})),
		};
	}

	private treeToManifest(tree: IRepositoryTree["tree"]): PublicationManifest {
		const files: Record<string, string> = {};

		for (const entry of tree) {
			if (entry.path && entry.sha && this.isManagedPath(entry.path))
				files[entry.path] = entry.sha;
		}

		return { version: 1, target: this.manifestTarget(), files };
	}

	private manifestTarget(): string {
		return JSON.stringify({
			host: (this.settings.sftpHost ?? "").trim(),
			port: this.settings.sftpPort || 22,
			username: (this.settings.sftpUsername ?? "").trim(),
			root: this.root(),
			notes: notePathBase(this.settings),
			assets: imagePathBase(this.settings),
		});
	}

	private isManagedPath(filePath: string): boolean {
		return (
			filePath.startsWith(notePathBase(this.settings)) ||
			filePath.startsWith(imagePathBase(this.settings))
		);
	}

	private hashContent(filePath: string, content: Buffer): string {
		return filePath.startsWith(notePathBase(this.settings))
			? generateBlobHash(content.toString("utf-8"))
			: generateBlobHashFromBase64(content.toString("base64"));
	}

	private fingerprint(key: Buffer): string {
		return `SHA256:${createHash("sha256")
			.update(key)
			.digest("base64")
			.replace(/=+$/, "")}`;
	}

	private toBuffer(content: unknown, filePath: string): Buffer {
		if (Buffer.isBuffer(content)) return content;

		if (typeof content === "string") return Buffer.from(content, "utf-8");

		if (Array.isArray(content)) return Buffer.from(content);

		if (ArrayBuffer.isView(content)) {
			return Buffer.from(
				content.buffer,
				content.byteOffset,
				content.byteLength,
			);
		}

		if (content instanceof ArrayBuffer) return Buffer.from(content);

		const type =
			content && typeof content === "object"
				? content.constructor?.name ?? "object"
				: typeof content;

		throw new Error(
			`SFTP returned unsupported ${type} data for ${filePath}`,
		);
	}

	private expandHome(filePath: string): string {
		if (filePath === "~") return os.homedir();

		if (filePath.startsWith("~/"))
			return path.join(os.homedir(), filePath.slice(2));

		return filePath;
	}
}
