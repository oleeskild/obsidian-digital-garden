import { transformMarkdownSync } from "./ast";

/**
 * Convert Obsidian block identifiers ("some text ^block-id") into the
 * published site's attribute syntax ("{ #block-id}"). Identifiers inside
 * code blocks and inline code are left alone — the parser never produces
 * blockid nodes there.
 */
export function replaceBlockIDs(markdown: string) {
	return transformMarkdownSync(markdown, (node) => {
		if (node.type !== "blockid") {
			return;
		}

		return node.ownLine ? `{ #${node.id}}\n\n` : `\n{ #${node.id}}\n`;
	});
}
