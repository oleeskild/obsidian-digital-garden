import { FrontMatterCache, Notice } from "obsidian";

export const hasPublishFlag = (
	frontMatter?: FrontMatterCache,
	publishByDefault = false,
): boolean => {
	const value = frontMatter?.["dg-publish"];

	if (value === undefined) return publishByDefault;

	return !!value && value !== "false";
};

export function isPublishFrontmatterValid(
	frontMatter?: FrontMatterCache,
	publishByDefault = false,
): boolean {
	if (!hasPublishFlag(frontMatter, publishByDefault)) {
		new Notice(
			"Note does not have the dg-publish: true set. Please add this and try again.",
		);

		return false;
	}

	return true;
}
