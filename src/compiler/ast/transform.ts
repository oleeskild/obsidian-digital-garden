import { MarkdownNode } from "./nodes";
import { parseMarkdown } from "./parseMarkdown";

/**
 * A visitor invoked for every node in document order. Return a string to
 * replace the node's source in the output; return undefined (or nothing)
 * to keep the node unchanged.
 */
export type NodeTransform = (
	node: MarkdownNode,
) => string | undefined | void | Promise<string | undefined | void>;

export type SyncNodeTransform = (
	node: MarkdownNode,
) => string | undefined | void;

/** Serialize nodes back to text. Without transforms this is the identity. */
export const serializeNodes = (nodes: MarkdownNode[]): string =>
	nodes.map((node) => node.source).join("");

/**
 * Parse the document and rebuild it, letting the visitor replace
 * individual nodes. Nodes the visitor ignores are emitted verbatim, so
 * the transform is lossless outside the nodes it touches.
 */
export const transformMarkdown = async (
	text: string,
	visit: NodeTransform,
): Promise<string> => {
	const output: string[] = [];

	for (const node of parseMarkdown(text)) {
		const replacement = await visit(node);

		output.push(
			typeof replacement === "string" ? replacement : node.source,
		);
	}

	return output.join("");
};

/** Synchronous variant of transformMarkdown */
export const transformMarkdownSync = (
	text: string,
	visit: SyncNodeTransform,
): string => {
	const output: string[] = [];

	for (const node of parseMarkdown(text)) {
		const replacement = visit(node);

		output.push(
			typeof replacement === "string" ? replacement : node.source,
		);
	}

	return output.join("");
};
