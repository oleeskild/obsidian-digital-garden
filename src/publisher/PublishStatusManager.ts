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
	 * 判断逻辑：
	 * 1. 如果远程路径在本地标记列表中存在 → 不是删除
	 * 2. 如果远程路径对应的内容哈希在本地存在 → 不是删除（可能是路径移动）
	 * 3. 如果远程路径在本地所有文件路径中存在（无论是否标记发布）→ 不是删除
	 * 4. 只有以上都不满足时，才认为是真正的删除
	 */
	private generateDeletedContentPaths(
		remoteNoteHashes: { [key: string]: string },
		marked: string[],
		localContentHashes: Set<string>,
		localPaths: string[],
		rewriteRules?: PathRewriteRules,
	): Array<{ path: string; sha: string }> {
		const isJsFile = (key: string) => key.endsWith(".js");

		// 应用路径重写规则，将本地路径转换为发布后的路径
		const rewrittenMarked = rewriteRules
			? marked.map((path) => getGardenPathForNote(path, rewriteRules))
			: marked;

		const rewrittenLocalPaths = rewriteRules
			? localPaths.map((path) => getGardenPathForNote(path, rewriteRules))
			: localPaths;

		// 检查路径是否被标记为发布
		const isMarkedForPublish = (key: string) =>
			rewrittenMarked.some((f) => f === key);

		// 检查路径是否存在于本地（无论是否标记发布）
		const isPathExistsLocally = (key: string) =>
			rewrittenLocalPaths.some((f) => f === key);

		// 过滤出需要删除的路径：
		// 1. 不是 JS 文件
		// 2. 路径没有被标记为发布
		// 3. 路径在本地所有文件中不存在（无论是否标记发布）
		// 4. 内容哈希不在本地内容哈希集合中
		const deletedPaths = Object.keys(remoteNoteHashes).filter((key) => {
			if (isJsFile(key)) return false;

			// 如果路径被标记为发布，不是删除
			if (isMarkedForPublish(key)) return false;

			// 如果路径存在于本地（无论是否标记发布），不是删除
			// 这处理了文件存在但未标记 pub-blog 的情况
			if (isPathExistsLocally(key)) return false;

			// 检查远程文件的内容哈希是否存在于本地
			// 如果存在，说明文件只是移动了路径，内容没变，不应该显示为删除
			const remoteHash = remoteNoteHashes[key];
			const contentExistsLocally = localContentHashes.has(remoteHash);

			// 只有当内容也不存在于本地时，才认为是真正的删除
			return !contentExistsLocally;
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

		// 获取所有本地文件（无论是否有 pub-blog 标记）
		// 用于 Deleted 判断：如果文件存在于本地（即使未标记发布），不应显示为删除
		const allLocalNotes = await this.publisher.getAllNotes();

		// 获取路径重写规则（提前到循环前）
		const rewriteRules = getRewriteRules(
			this.publisher.settings.pathRewriteRules,
		);

		// 收集所有本地文件的内容哈希（用于后续删除判断）
		const localContentHashes = new Set<string>();

		// 首先收集所有本地文件的哈希（包括未标记发布的）
		for (const file of allLocalNotes) {
			const compiledFile = await file.compile();
			const [content, _] = compiledFile.getCompiledFile();
			const localHash = generateBlobHash(content);
			localContentHashes.add(localHash);
		}

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

		// 收集所有本地文件路径（用于删除判断）
		const allLocalPaths = allLocalNotes.map((f) => f.getPath());

		// 使用改进的删除检测逻辑，传入本地内容哈希集合和本地路径
		const deletedNotePaths = this.generateDeletedContentPaths(
			remoteNoteHashes,
			marked.notes.map((f) => f.getPath()),
			localContentHashes,
			allLocalPaths,
			rewriteRules,
		);

		const deletedImagePaths = this.generateDeletedContentPaths(
			remoteImageHashes,
			marked.images,
			localContentHashes,
			marked.images, // 图片路径直接使用
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
