import { FrontMatterCache, Notice } from "obsidian";

export const hasPublishFlag = (
	flag: string,
	frontMatter?: FrontMatterCache,
): boolean => !!frontMatter?.[flag];

export function isPublishFrontmatterValid(
	flag: string,
	frontMatter?: FrontMatterCache,
): boolean {
	if (!hasPublishFlag(flag, frontMatter)) {
		new Notice(
			"Note does not have the publish: true set. Please add this and try again.",
		);

		return false;
	}

	return true;
}
