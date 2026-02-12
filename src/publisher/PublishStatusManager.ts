import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "./Publisher";
import {
	generateBlobHash,
	getRewriteRules,
	getGardenPathForNote,
} from "../utils/utils";
import { CompiledPublishFile } from "../publishFile/PublishFile";
import { PathRewriteRules } from "../repositoryConnection/DigitalGardenSiteManager";

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
	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
		rewriteRules?: PathRewriteRules,
	): Array<{ path: string; sha: string }> {
		const isJsFile = (key: string) => key.endsWith(".js");

		// 应用路径重写规则，将本地路径转换为发布后的路径
		const rewrittenMarked = rewriteRules
			? marked.map((path) => getGardenPathForNote(path, rewriteRules))
			: marked;

		const isMarkedForPublish = (key: string) =>
			rewrittenMarked.find((f) => f === key);

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

		// 获取路径重写规则（提前到循环前）
		const rewriteRules = getRewriteRules(
			this.publisher.settings.pathRewriteRules,
		);

		for (const file of marked.notes) {
			const compiledFile = await file.compile();
			const [content, _] = compiledFile.getCompiledFile();

			const localHash = generateBlobHash(content);

			// 获取文件的frontmatter信息，检查pub-blog标志
			const frontmatter = file.getFrontmatter();
			const isPubBlogEnabled = !!(frontmatter && frontmatter["pub-blog"]);

			// 只处理pub-blog为true的文件
			if (isPubBlogEnabled) {
				// 1. 使用重写后的路径直接查找远程文件
				const rewrittenPath = getGardenPathForNote(
					file.getPath(),
					rewriteRules,
				);
				const remoteHash = remoteNoteHashes[rewrittenPath];
				const fileFound = remoteHash !== undefined;

				// 2. 如果找到同名文件，表示已经发布过
				if (fileFound && remoteHash !== undefined) {
					compiledFile.setRemoteHash(remoteHash);

					// 3. 通过哈希值判断是否有更改
					if (remoteHash === localHash) {
						// 没有更改，放入published
						publishedNotes.push(compiledFile);
					} else {
						// 有更改，放入changed
						changedNotes.push(compiledFile);
					}
				} else {
					// 4. pub-blog为true但在远程仓库中找不到同名文件，放入unpublished
					unpublishedNotes.push(compiledFile);
				}
			}
		}

		const deletedNotePaths = this.generateDeletedContentPaths(
			remoteNoteHashes,
			marked.notes.map((f) => f.getPath()),
			rewriteRules,
		);

		const deletedImagePaths = this.generateDeletedContentPaths(
			remoteImageHashes,
			marked.images,
			rewriteRules,
		);

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
