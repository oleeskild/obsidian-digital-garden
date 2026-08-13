import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "./Publisher";
import { generateBlobHash } from "../utils/utils";
import { CompiledPublishFile } from "../publishFile/PublishFile";
import { imageHashKey } from "./paths";
import { TFile, getLinkpath } from "obsidian";
import {
	CompilationCacheEntry,
	CompilationCacheStore,
	compilationCacheStore,
} from "./CompilationCacheStore";

/**
 *  Manages the publishing status of notes and images for a digital garden.
 */
export default class PublishStatusManager implements IPublishStatusManager {
	siteManager: DigitalGardenSiteManager;
	publisher: Publisher;
	private cacheStore: CompilationCacheStore;
	constructor(
		siteManager: DigitalGardenSiteManager,
		publisher: Publisher,
		cacheStore: CompilationCacheStore = compilationCacheStore,
	) {
		this.siteManager = siteManager;
		this.publisher = publisher;
		this.cacheStore = cacheStore;
	}
	getDeletedNotePaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}
	getDeletedImagesPaths(): Promise<string[]> {
		throw new Error("Method not implemented.");
	}

	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<{ path: string; sha: string }> {
		const isJsFile = (key: string) => key.endsWith(".js");

		const isMarkedForPublish = (key: string) =>
			marked.find((f) => f === key);

		const deletedPaths = Object.keys(remoteNoteHashes).filter(
			(key) => !isJsFile(key) && !isMarkedForPublish(key),
		);

		const pathsWithSha = deletedPaths.map((path) => {
			return {
				path,
				sha: remoteNoteHashes[path],
			};
		});

		return pathsWithSha;
	}
	async getPublishStatus(
		onProgress?: (progress: PublishStatusProgress) => void,
	): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];

		onProgress?.({
			completed: 0,
			message: "Connecting to publication provider…",
		});

		const contentTree = await (
			await this.siteManager.getUserGardenConnection()
		).getContent("HEAD", (progress) => onProgress?.(progress));

		if (!contentTree) {
			throw new Error("Could not get content tree from base garden");
		}

		onProgress?.({ completed: 0, message: "Indexing remote content…" });

		const remoteNoteHashes =
			await this.siteManager.getNoteHashes(contentTree);

		const remoteImageHashes =
			await this.siteManager.getImageHashes(contentTree);
		this.publisher.setRemoteImageHashes(remoteImageHashes);

		onProgress?.({
			completed: 0,
			message: "Finding marked notes and assets…",
		});
		const marked = await this.publisher.getFilesMarkedForPublishing();
		const cache = await this.cacheStore.read();
		const nextCache: Record<string, CompilationCacheEntry> = {};

		const compilerFingerprint =
			this.publisher.getCompilerFingerprint?.() ?? "unknown";
		let processed = 0;

		for (const file of marked.notes) {
			const remoteHash = remoteNoteHashes[file.getPath()];
			const signature = await this.getInputSignature(file.file);
			const cached = cache[file.getPath()];

			const canReuse =
				remoteHash !== undefined &&
				signature !== undefined &&
				cached?.signature === signature &&
				cached.compilerFingerprint === compilerFingerprint &&
				cached.compiledHash === remoteHash &&
				cached.assetPaths.every(
					(path) =>
						remoteImageHashes[imageHashKey(path)] !== undefined,
				);

			if (canReuse) {
				const compiledFile = file.withCompiledFile([
					"",
					{
						images: cached.assetPaths.map((path) => ({
							path,
							content: "",
						})),
					},
				]);
				compiledFile.setRemoteHash(remoteHash);
				publishedNotes.push(compiledFile);
				nextCache[file.getPath()] = cached;
				processed++;
				continue;
			}

			onProgress?.({
				completed: processed,
				total: marked.notes.length,
				message: `Compiling note: ${file.getPath()}`,
			});

			// Yield only for real compilation work. Cache hits stay on the fast path.
			if (onProgress) {
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			}

			const compiledFile = await file.compile();
			const [content, assets] = compiledFile.getCompiledFile();

			const localHash = generateBlobHash(content);

			if (signature) {
				nextCache[file.getPath()] = {
					signature,
					compilerFingerprint,
					compiledHash: localHash,
					assetPaths: assets.images.map((image) => image.path),
				};
			}

			// A note whose referenced images never made it to the remote
			// (e.g. frontmatter covers published with plugin < 2.80.2) is
			// not fully published, even if the note text is unchanged.
			const missingRemoteAssets = assets.images
				.filter((image) => !remoteImageHashes[imageHashKey(image.path)])
				.map((image) => image.path);
			const hasMissingRemoteImage = missingRemoteAssets.length > 0;
			compiledFile.setMissingRemoteAssets(missingRemoteAssets);

			if (!remoteHash) {
				unpublishedNotes.push(compiledFile);
			} else if (remoteHash === localHash && !hasMissingRemoteImage) {
				compiledFile.setRemoteHash(remoteHash);
				publishedNotes.push(compiledFile);
			} else {
				compiledFile.setRemoteHash(remoteHash);
				changedNotes.push(compiledFile);
			}
			processed++;
		}

		await this.cacheStore.write(nextCache);

		onProgress?.({
			completed: marked.notes.length,
			total: marked.notes.length,
			message: "Finalizing publication status…",
		});

		const deletedNotePaths = this.generateDeletedContentPaths(
			remoteNoteHashes,
			marked.notes.map((f) => f.getPath()),
		);

		const deletedImagePaths = this.generateDeletedContentPaths(
			remoteImageHashes,
			marked.images,
		);
		// These might already be sorted, as getFilesMarkedForPublishing sorts already
		publishedNotes.sort((a, b) => a.compare(b));
		publishedNotes.sort((a, b) => a.compare(b));
		changedNotes.sort((a, b) => a.compare(b));
		deletedNotePaths.sort((a, b) => a.path.localeCompare(b.path));

		return {
			unpublishedNotes,
			publishedNotes,
			changedNotes,
			deletedNotePaths,
			deletedImagePaths,
		};
	}

	private async getInputSignature(
		file: TFile | undefined,
	): Promise<string | undefined> {
		if (
			!file ||
			file.extension !== "md" ||
			file.name.endsWith(".excalidraw.md")
		)
			return undefined;

		const source = await this.publisher.vault.cachedRead(file);

		// Dataview and DataviewJS can depend on arbitrary vault state. Until the
		// Dataview API exposes dependencies, compiling these notes is the safe path.
		if (/```\s*dataview(?:js)?\b|`\s*=\s*[^`]+`/i.test(source))
			return undefined;

		const snapshots: Array<[string, number, number]> = [];
		const visited = new Set<string>();

		const visit = (current: TFile, depth: number) => {
			if (visited.has(current.path) || depth > 4) return;
			visited.add(current.path);

			snapshots.push([
				current.path,
				current.stat.mtime,
				current.stat.size,
			]);

			const metadata = this.publisher.metadataCache.getCache(
				current.path,
			);

			const links = [
				...(metadata?.links ?? []),
				...(metadata?.embeds ?? []),
			];

			for (const link of links) {
				const linked =
					this.publisher.metadataCache.getFirstLinkpathDest(
						getLinkpath(link.link),
						current.path,
					);

				if (linked) visit(linked, depth + 1);
			}
		};

		visit(file, 0);
		snapshots.sort(([a], [b]) => a.localeCompare(b));

		return generateBlobHash(JSON.stringify(snapshots));
	}
}

interface PathToRemove {
	path: string;
	sha: string;
}

export interface PublishStatus {
	unpublishedNotes: Array<CompiledPublishFile>;
	publishedNotes: Array<CompiledPublishFile>;
	changedNotes: Array<CompiledPublishFile>;
	deletedNotePaths: Array<PathToRemove>;
	deletedImagePaths: Array<PathToRemove>;
}

export interface IPublishStatusManager {
	getPublishStatus(
		onProgress?: (progress: PublishStatusProgress) => void,
	): Promise<PublishStatus>;
}

export interface PublishStatusProgress {
	completed: number;
	total?: number;
	message: string;
}
