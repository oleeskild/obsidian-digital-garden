import { MetadataCache, Vault } from "obsidian";
import { hasPublishFlag } from "../publishFile/Validator";

/**
 * Bases can show and sort by file.ctime / file.mtime, but the garden only
 * knows a note's file timestamps if they're in its published frontmatter.
 * Publishing them for every garden would make notes look changed whenever a
 * sync tool touches a file, so they're only published when a published base
 * actually uses them.
 */

const FILE_TIMESTAMP_REF = /\bfile\.(ctime|mtime)\b/;

const BASE_CODE_BLOCK =
	/^[ \t]*(`{3,}|~{3,})[ \t]*base[ \t]*\r?\n([\s\S]*?)^[ \t]*\1/gm;

/** Whether a ```base block in this note text references file.ctime/mtime. */
export function baseBlocksUseFileTimestamps(text: string): boolean {
	for (const match of text.matchAll(BASE_CODE_BLOCK)) {
		if (FILE_TIMESTAMP_REF.test(match[2])) {
			return true;
		}
	}

	return false;
}

/** Whether a .base file's contents reference file.ctime/mtime. */
export function baseFileUsesFileTimestamps(text: string): boolean {
	return FILE_TIMESTAMP_REF.test(text);
}

/**
 * Scan the published notes for a base that uses file.ctime/mtime, either
 * inline as a ```base block or as an embedded .base file. Only notes the
 * metadata cache says contain a code block are read, and the scan stops at
 * the first hit.
 */
export async function publishedBasesUseFileTimestamps(
	vault: Vault,
	metadataCache: MetadataCache,
): Promise<boolean> {
	const checkedBaseFiles = new Set<string>();

	for (const file of vault.getMarkdownFiles()) {
		const cache = metadataCache.getFileCache(file);

		if (!hasPublishFlag(cache?.frontmatter)) {
			continue;
		}

		for (const embed of cache?.embeds ?? []) {
			const linkpath = embed.link.split("#")[0];

			const target = metadataCache.getFirstLinkpathDest(
				linkpath,
				file.path,
			);

			if (
				!target ||
				target.extension !== "base" ||
				checkedBaseFiles.has(target.path)
			) {
				continue;
			}

			checkedBaseFiles.add(target.path);

			if (baseFileUsesFileTimestamps(await vault.cachedRead(target))) {
				return true;
			}
		}

		const hasCodeBlock = cache?.sections?.some(
			(section) => section.type === "code",
		);

		if (
			hasCodeBlock &&
			baseBlocksUseFileTimestamps(await vault.cachedRead(file))
		) {
			return true;
		}
	}

	return false;
}
