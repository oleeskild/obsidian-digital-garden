import fs from "fs/promises";
import path from "path";
import { CompiledPublishFile } from "src/publishFile/PublishFile";
import { generateBlobHash, generateBlobHashFromBase64 } from "src/utils/utils";
import { imagePathBase, notePathBase } from "src/publisher/paths";
import DigitalGardenSettings from "src/models/settings";
import {
	publicationManifestStore,
	type PublicationManifest,
} from "src/publisher/PublicationManifestStore";
import type {
	IPutPayload,
	IRepositoryConnection,
	IRepositoryFile,
	IRepositoryTree,
} from "./RepositoryConnection";

export class LocalFolderRepositoryConnection implements IRepositoryConnection {
	constructor(private settings: DigitalGardenSettings) {}

	getRepositoryName() {
		return this.root();
	}

	async getContent(_branch: string): Promise<IRepositoryTree> {
		const manifest = await publicationManifestStore.read(
			"local",
			this.manifestTarget(),
		);

		if (manifest) return this.manifestToTree(manifest);

		const tree: IRepositoryTree["tree"] = [];

		const contentRoots = new Set([
			notePathBase(this.settings),
			imagePathBase(this.settings),
		]);

		for (const contentRoot of contentRoots) {
			const normalizedRoot = contentRoot
				.replace(/\\/g, "/")
				.replace(/\/+$/, "");
			await this.walk(this.resolve(normalizedRoot), normalizedRoot, tree);
		}

		await publicationManifestStore.write(
			"local",
			this.treeToManifest(tree),
		);

		return { tree };
	}

	async getFile(filePath: string): Promise<IRepositoryFile | undefined> {
		try {
			const content = await fs.readFile(this.resolve(filePath));
			const encoded = content.toString("base64");

			return {
				type: "file",
				path: filePath,
				content: encoded,
				sha: generateBlobHashFromBase64(encoded),
			};
		} catch {
			return undefined;
		}
	}

	async deleteFile(filePath: string): Promise<boolean> {
		try {
			await fs.unlink(this.resolve(filePath));
			await this.removeManifestPaths([filePath]);

			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				await this.removeManifestPaths([filePath]);

				return false;
			}
			throw error;
		}
	}

	async updateFile(payload: IPutPayload): Promise<void> {
		const destination = this.resolve(payload.path);
		const content = Buffer.from(payload.content, "base64");
		await fs.mkdir(path.dirname(destination), { recursive: true });
		await fs.writeFile(destination, content);

		if (this.isManagedPath(payload.path)) {
			const manifest = await this.getOrBuildManifest();

			manifest.files[payload.path] = this.hashContent(
				payload.path,
				content,
			);
			await publicationManifestStore.write("local", manifest);
		}
	}

	async updateFiles(
		files: CompiledPublishFile[],
		_remoteImageHashes?: Record<string, string>,
		onProgress?: (completed: number, currentPath: string) => void,
	): Promise<void> {
		const manifest = await this.getOrBuildManifest();
		let completed = 0;

		for (const file of files) {
			const [content, assets] = file.getCompiledFile();

			const notePath = notePathBase(this.settings) + file.getPath();
			const destination = this.resolve(notePath);
			await fs.mkdir(path.dirname(destination), { recursive: true });
			await fs.writeFile(destination, content, "utf-8");
			manifest.files[notePath] = generateBlobHash(content);

			for (const asset of assets.images) {
				const relative = asset.path.replace(/^\/?img\/user\//, "");

				const assetDestination = this.resolve(
					imagePathBase(this.settings) + relative,
				);

				await fs.mkdir(path.dirname(assetDestination), {
					recursive: true,
				});

				await fs.writeFile(
					assetDestination,
					Buffer.from(asset.content, "base64"),
				);

				manifest.files[imagePathBase(this.settings) + relative] =
					asset.localHash ??
					generateBlobHashFromBase64(asset.content);
			}

			completed++;
			onProgress?.(completed, file.getPath());
		}

		await publicationManifestStore.write("local", manifest);
	}

	async deleteFiles(paths: string[]): Promise<void> {
		for (const filePath of paths) await this.deleteFile(filePath);
	}

	async getLatestRelease() {
		return undefined;
	}
	async getLatestCommit() {
		return undefined;
	}
	async getRepositoryInfo() {
		return { default_branch: "local" };
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

	private async getOrBuildManifest(): Promise<PublicationManifest> {
		const existing = await publicationManifestStore.read(
			"local",
			this.manifestTarget(),
		);

		if (existing) return existing;

		const tree: IRepositoryTree["tree"] = [];

		for (const contentRoot of new Set([
			notePathBase(this.settings),
			imagePathBase(this.settings),
		])) {
			const normalizedRoot = contentRoot
				.replace(/\\/g, "/")
				.replace(/\/+$/, "");
			await this.walk(this.resolve(normalizedRoot), normalizedRoot, tree);
		}

		return this.treeToManifest(tree);
	}

	private async removeManifestPaths(paths: string[]): Promise<void> {
		const managedPaths = paths.filter((filePath) =>
			this.isManagedPath(filePath),
		);

		if (managedPaths.length === 0) return;

		const manifest = await this.getOrBuildManifest();

		for (const filePath of managedPaths) delete manifest.files[filePath];
		await publicationManifestStore.write("local", manifest);
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

	private manifestTarget(): string {
		return JSON.stringify({
			root: this.root(),
			notes: notePathBase(this.settings),
			assets: imagePathBase(this.settings),
		});
	}

	private root(): string {
		if (!this.settings.localExportPath)
			throw new Error("Local garden folder is not configured");

		return path.resolve(this.settings.localExportPath);
	}

	private resolve(relativePath: string): string {
		const root = this.root();
		const destination = path.resolve(root, relativePath);

		if (destination !== root && !destination.startsWith(root + path.sep)) {
			throw new Error(
				`Path escapes local garden folder: ${relativePath}`,
			);
		}

		return destination;
	}

	private async walk(
		folder: string,
		relative: string,
		tree: IRepositoryTree["tree"],
	): Promise<void> {
		let entries;

		try {
			entries = await fs.readdir(folder, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}

		for (const entry of entries) {
			const relativePath = relative
				? `${relative}/${entry.name}`
				: entry.name;
			const fullPath = path.join(folder, entry.name);

			if (entry.isDirectory())
				await this.walk(fullPath, relativePath, tree);
			else if (entry.isFile()) {
				const content = await fs.readFile(fullPath);
				const normalized = relativePath.replace(/\\/g, "/");

				tree.push({
					path: normalized,
					type: "blob",
					sha: normalized.startsWith(notePathBase(this.settings))
						? generateBlobHash(content.toString("utf-8"))
						: generateBlobHashFromBase64(
								content.toString("base64"),
						  ),
				});
			}
		}
	}
}
