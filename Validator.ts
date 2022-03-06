
import { FrontMatterCache, Notice } from "obsidian";

export function vallidatePublishFrontmatter(frontMatter: FrontMatterCache): boolean {
    if (!frontMatter || !frontMatter["dg-publish"]) {
        new Notice("Note does not have the dg-publish: true set. Please add this and try again.")
        return false;
    }
    return true;
}