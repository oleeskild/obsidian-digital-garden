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

	/**
	 * 生成需要删除的内容路径列表
	 * 判断逻辑：远程存在但本地未标记为发布的文件
	 */
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

		// 检查路径是否被标记为发布
		const isMarkedForPublish = (key: string) =>
			rewrittenMarked.some((f) => f === key);

		// 过滤出需要删除的路径
		const deletedPaths = Object.keys(remoteNoteHashes).filter((key) => {
			if (isJsFile(key)) return false;

			// 如果路径被标记为发布，不是删除
			if (isMarkedForPublish(key)) return false;

			return true;
		});

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

		// 处理发布状态判断
		// 只检测 pub-blog=true 的文件
		for (const file of marked.notes) {
			const compiledFile = await file.compile();
			const [content, _] = compiledFile.getCompiledFile();
			const localHash = generateBlobHash(content);

			// 获取文件的 frontmatter 信息
			const frontmatter = file.getFrontmatter();

			// 支持字符串和数组格式的 status
			const status = Array.isArray(frontmatter?.status)
				? frontmatter.status[0]
				: frontmatter?.status;

			// 使用重写后的路径查找远程文件
			const rewrittenPath = getGardenPathForNote(
				file.getPath(),
				rewriteRules,
			);
			const remoteHash = remoteNoteHashes[rewrittenPath];
			const fileFound = remoteHash !== undefined;

			// 根据 status 属性判断发布状态
			if (status === "🟡 Ongoing" || status === "🟡Ongoing") {
				// 🟡 Ongoing 状态：检测远程状态
				// 远程有文件 → Changed（表示修改过需要重新发布）
				// 远程没有文件 → Unpublished（表示新文件）
				if (fileFound) {
					compiledFile.setRemoteHash(remoteHash);
					changedNotes.push(compiledFile);
				} else {
					unpublishedNotes.push(compiledFile);
				}
			} else if (status === "🟢 Done" || status === "🟢Done") {
				// 🟢 Done 状态：表示已发布完成，始终显示在 Published 中
				publishedNotes.push(compiledFile);
			} else {
				// 其他状态（或无 status）：使用默认逻辑检测
				if (fileFound) {
					compiledFile.setRemoteHash(remoteHash);

					if (remoteHash === localHash) {
						publishedNotes.push(compiledFile);
					} else {
						changedNotes.push(compiledFile);
					}
				} else {
					unpublishedNotes.push(compiledFile);
				}
			}
		}

		// 使用简化的删除检测逻辑
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
