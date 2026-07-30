import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "./Publisher";
import { generateBlobHash } from "../utils/utils";
import { CompiledPublishFile } from "../publishFile/PublishFile";
import { imageHashKey } from "./paths";

/**
 *  Manages the publishing status of notes and images for a digital garden.
 */
export default class PublishStatusManager implements IPublishStatusManager {
	siteManager: DigitalGardenSiteManager;
	publisher: Publisher;
	constructor(siteManager: DigitalGardenSiteManager, publisher: Publisher) {
		this.siteManager = siteManager;
		this.publisher = publisher;
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
	async getPublishStatus(): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];

		const contentTree = await (
			await this.siteManager.getUserGardenConnection()
		).getContent("HEAD");

		if (!contentTree) {
			throw new Error("Could not get content tree from base garden");
		}

		const remoteNoteHashes =
			await this.siteManager.getNoteHashes(contentTree);

		const remoteImageHashes =
			await this.siteManager.getImageHashes(contentTree);

		const marked = await this.publisher.getFilesMarkedForPublishing();

		for (const file of marked.notes) {
			const compiledFile = await file.compile();
			const [content, assets] = compiledFile.getCompiledFile();

			const localHash = generateBlobHash(content);
			const remoteHash = remoteNoteHashes[file.getPath()];

			// A note whose referenced images never made it to the remote
			// (e.g. frontmatter covers published with plugin < 2.80.2) is
			// not fully published, even if the note text is unchanged.
			const hasMissingRemoteImage = assets.images.some(
				(image) => !remoteImageHashes[imageHashKey(image.path)],
			);

			if (!remoteHash) {
				unpublishedNotes.push(compiledFile);
			} else if (remoteHash === localHash && !hasMissingRemoteImage) {
				compiledFile.setRemoteHash(remoteHash);
				publishedNotes.push(compiledFile);
			} else {
				compiledFile.setRemoteHash(remoteHash);
				changedNotes.push(compiledFile);
			}
		}

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
	getPublishStatus(): Promise<PublishStatus>;
}
