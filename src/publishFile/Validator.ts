import { FrontMatterCache } from "obsidian";

export const hasPublishFlag = (
	frontMatter?: FrontMatterCache,
	publishByDefault = false,
): boolean => {
	const value = frontMatter?.["dg-publish"];

	if (value === undefined) return publishByDefault;

	return !!value && value !== "false";
};
