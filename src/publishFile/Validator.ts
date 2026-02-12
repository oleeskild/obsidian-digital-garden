import { FrontMatterCache, Notice } from "obsidian";

export const hasPublishFlag = (frontMatter?: FrontMatterCache): boolean =>
	!!frontMatter?.["pub-blog"];

export function isPublishFrontmatterValid(
	frontMatter?: FrontMatterCache,
): boolean {
	if (!hasPublishFlag(frontMatter)) {
		new Notice(
			"Note does not have the pub-blog: true set. Please add this and try again.",
		);

		return false;
	}

	return true;
}
