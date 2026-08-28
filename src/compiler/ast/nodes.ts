/**
 * Node types for the lossless Obsidian-markdown AST.
 *
 * Every node records the exact source slice it was parsed from, so a
 * document serializes back byte-for-byte unless a transform explicitly
 * replaces a node. Compile steps operate on typed nodes instead of
 * re-scanning the raw text with regexes, which makes "skip code blocks,
 * frontmatter and injected scripts" the default rather than something
 * every step has to re-implement.
 */

export interface BaseNode {
	/** Start offset in the source document (inclusive) */
	start: number;
	/** End offset in the source document (exclusive) */
	end: number;
	/** Exact source slice for this node */
	source: string;
}

/** Plain text between other nodes */
export interface TextNode extends BaseNode {
	type: "text";
}

/** The frontmatter block at the start of the document, including fences */
export interface FrontmatterNode extends BaseNode {
	type: "frontmatter";
	/** Raw content between the --- fences */
	body: string;
}

/**
 * A fenced code block (``` or ~~~), optionally nested in a blockquote or
 * callout ("> ```dataview"). The node starts at the first fence character,
 * so any blockquote prefix stays in the surrounding text and survives
 * replacement.
 */
export interface CodeBlockNode extends BaseNode {
	type: "codeblock";
	/** Trimmed info string, e.g. "dataview" or "js" */
	info: string;
	/**
	 * Raw content between the opening fence line and the closing fence
	 * characters, exactly as the document contains it — lines keep their
	 * blockquote prefixes, and inside a callout the closing line's "> "
	 * prefix is included at the end.
	 */
	body: string;
	/**
	 * The body with blockquote markers stripped from each line (all
	 * nesting levels). Equal to body outside blockquotes. Consumers that
	 * interpret the content (dataview) should read this, not body.
	 */
	cleanBody: string;
	/**
	 * The blockquote prefix of the opening fence line ("> ", "> > ", or
	 * "" outside a callout) — what a consumer re-applies to keep a
	 * multi-line replacement inside the callout.
	 */
	linePrefix: string;
	/** False when no closing fence was found (block runs to end of file) */
	closed: boolean;
}

/** An inline code span, e.g. `code` or ``code`` */
export interface InlineCodeNode extends BaseNode {
	type: "inlinecode";
	/** Content between the backticks */
	body: string;
}

/** An Obsidian %%comment%%, possibly spanning multiple lines */
export interface CommentNode extends BaseNode {
	type: "comment";
	/** Content between the %% markers */
	body: string;
}

/**
 * A raw <script> or <style> element. Compiled excalidraw drawings and
 * similar HTML are injected mid-pipeline; their contents are full of
 * "[[1,2],..." sequences and must never be scanned for markdown syntax.
 */
export interface RawHtmlNode extends BaseNode {
	type: "rawhtml";
	tag: "script" | "style";
}

/** A wikilink [[target#ref|alias]] or embed ![[target|size]] */
export interface WikilinkNode extends BaseNode {
	type: "wikilink";
	/** True for embeds/transclusions (![[...]]) */
	embed: boolean;
	/** Raw text between [[ and ]] */
	inner: string;
	/**
	 * inner split on pipes, tolerating table-escaped pipes ("\|").
	 * parts[0] is the link target (with any #ref), the rest are
	 * alias/size/metadata segments.
	 */
	parts: string[];
	/** parts[0]: the link target including any #header or #^block ref */
	targetWithRef: string;
	/** The link target without the #ref part */
	linkpath: string;
	/** The "#Header" / "#^block" suffix, or "" when absent */
	ref: string;
}

/** A markdown link [label](destination) or image/embed ![label](destination) */
export interface MarkdownLinkNode extends BaseNode {
	type: "mdlink";
	/** True for images/embeds (![...](...)) */
	embed: boolean;
	label: string;
	/** Raw destination between the parentheses */
	destination: string;
}

/**
 * A block identifier. Either trailing content on a line ("foo ^block-id",
 * the node covers the leading space) or alone on its own line (the node
 * covers the surrounding newlines, mirroring how the published site's
 * attribute syntax replaces them).
 */
export interface BlockIdNode extends BaseNode {
	type: "blockid";
	/** The identifier without the leading ^ */
	id: string;
	/** True when the id is alone on its own line */
	ownLine: boolean;
}

export type MarkdownNode =
	| TextNode
	| FrontmatterNode
	| CodeBlockNode
	| InlineCodeNode
	| CommentNode
	| RawHtmlNode
	| WikilinkNode
	| MarkdownLinkNode
	| BlockIdNode;
