import DigitalGardenSiteManager from "./DigitalGardenSiteManager";
import Publisher from "./Publisher";
import { generateBlobHash } from "../utils/utils";
import { CompiledPublishFile } from "../publishFile/PublishFile";

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

	async getDeletedNotePaths(): Promise<Array<string>> {
		const remoteNoteHashes = await this.siteManager.getNoteHashes();
		const marked = await this.publisher.getFilesMarkedForPublishing();

		return this.generateDeletedContentPaths(
			remoteNoteHashes,
			marked.notes.map((f) => f.getPath()),
		);
	}

	async getDeletedImagesPaths(): Promise<Array<string>> {
		const remoteImageHashes = await this.siteManager.getImageHashes();
		const marked = await this.publisher.getFilesMarkedForPublishing();

		return this.generateDeletedContentPaths(
			remoteImageHashes,
			marked.images,
		);
	}

	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
	): Array<string> {
		const isJsFile = (key: string) => key.endsWith(".js");

		const isMarkedForPublish = (key: string) =>
			marked.find((f) => f === key);

		const deletedImagePaths = Object.keys(remoteNoteHashes).filter(
			(key) => !isJsFile(key) && !isMarkedForPublish(key),
		);

		return deletedImagePaths;
	}
	async getPublishStatus(): Promise<PublishStatus> {
		const unpublishedNotes: Array<CompiledPublishFile> = [];
		const publishedNotes: Array<CompiledPublishFile> = [];
		const changedNotes: Array<CompiledPublishFile> = [];

		const remoteNoteHashes = await this.siteManager.getNoteHashes();
		const remoteImageHashes = await this.siteManager.getImageHashes();

		const marked = await this.publisher.getFilesMarkedForPublishing();

		for (const file of marked.notes) {
			const compiledFile = await file.compile();
			const [content, _] = await compiledFile.getCompiledFile();

			const localHash = generateBlobHash(content);
			const remoteHash = remoteNoteHashes[file.getPath()];

			if (!remoteHash) {
				unpublishedNotes.push(compiledFile);
			} else if (remoteHash === localHash) {
				publishedNotes.push(compiledFile);
			} else {
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
		unpublishedNotes.sort((a, b) => (a.getPath() > b.getPath() ? 1 : -1));
		publishedNotes.sort((a, b) => (a.getPath() > b.getPath() ? 1 : -1));
		changedNotes.sort((a, b) => (a.getPath() > b.getPath() ? 1 : -1));
		deletedNotePaths.sort((a, b) => (a > b ? 1 : -1));

		return {
			unpublishedNotes,
			publishedNotes,
			changedNotes,
			deletedNotePaths,
			deletedImagePaths,
		};
	}
}

export interface PublishStatus {
	unpublishedNotes: Array<CompiledPublishFile>;
	publishedNotes: Array<CompiledPublishFile>;
	changedNotes: Array<CompiledPublishFile>;
	deletedNotePaths: Array<string>;
	deletedImagePaths: Array<string>;
}

export interface IPublishStatusManager {
	getPublishStatus(): Promise<PublishStatus>;
	getDeletedNotePaths(): Promise<Array<string>>;
	getDeletedImagesPaths(): Promise<Array<string>>;
}
