import fs from "fs/promises";
import os from "os";
import path from "path";
import posixPath from "path/posix";
import { createHash } from "crypto";
import type SftpClientType from "ssh2-sftp-client";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import DigitalGardenSettings, {
	DEFAULT_SFTP_PRIVATE_KEY_PATH,
} from "src/models/settings";
import { generateBlobHash, generateBlobHashFromBase64 } from "src/utils/utils";
import { imagePathBase, notePathBase } from "src/publisher/paths";
import type {
	IPutPayload,
	IRepositoryConnection,
	IRepositoryFile,
	IRepositoryTree,
} from "./RepositoryConnection";

/** Repository-compatible storage backed by the SFTP subsystem of an SSH server. */
export class SftpRepositoryConnection implements IRepositoryConnection {
	constructor(private settings: DigitalGardenSettings) {}

	getRepositoryName(): string {
		return `${this.settings.sftpUsername}@${
			this.settings.sftpHost
		}:${this.root()}`;
	}

	async getContent(_branch: string): Promise<IRepositoryTree> {
		return this.withClient(async (client) => {
			const tree: IRepositoryTree["tree"] = [];

			const roots = new Set([
				notePathBase(this.settings),
				imagePathBase(this.settings),
			]);

			for (const contentRoot of roots) {
				const relative = contentRoot.replace(/\/+$/, "");
				await this.walk(client, relative, tree);
			}

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

			return true;
		});
	}

	async updateFile(payload: IPutPayload): Promise<void> {
		await this.withClient(async (client) => {
			await this.put(
				client,
				payload.path,
				Buffer.from(payload.content, "base64"),
			);
		});
	}

	async updateFiles(
		files: CompiledPublishFile[],
		remoteImageHashes: Record<string, string> = {},
	): Promise<void> {
		await this.withClient(async (client) => {
			const uploadedAssets = new Set<string>();

			for (const file of files) {
				const [content, assets] = file.getCompiledFile();

				await this.put(
					client,
					notePathBase(this.settings) + file.getPath(),
					Buffer.from(content, "utf-8"),
				);

				for (const asset of assets.images) {
					const relative = asset.path.replace(/^\/?img\/user\//, "");

					if (uploadedAssets.has(relative)) continue;
					uploadedAssets.add(relative);

					if (
						asset.localHash &&
						remoteImageHashes[relative] === asset.localHash
					)
						continue;

					await this.put(
						client,
						imagePathBase(this.settings) + relative,
						Buffer.from(asset.content, "base64"),
					);
				}
			}
		});
	}

	async deleteFiles(paths: string[]): Promise<void> {
		await this.withClient(async (client) => {
			for (const filePath of paths) {
				const remotePath = this.resolve(filePath);

				if (await client.exists(remotePath))
					await client.delete(remotePath);
			}
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
	): Promise<void> {
		const remotePath = this.resolve(relative);

		if (!(await client.exists(remotePath))) return;

		for (const entry of await client.list(remotePath)) {
			const child = relative ? `${relative}/${entry.name}` : entry.name;

			if (entry.type === "d") await this.walk(client, child, tree);
			else if (entry.type === "-") {
				const content = await client.get(this.resolve(child));
				const buffer = this.toBuffer(content, child);

				tree.push({
					path: child,
					type: "blob",
					sha: child.startsWith(notePathBase(this.settings))
						? generateBlobHash(buffer.toString("utf-8"))
						: generateBlobHashFromBase64(buffer.toString("base64")),
				});
			}
		}
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
