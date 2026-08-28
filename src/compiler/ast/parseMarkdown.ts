import {
	BlockIdNode,
	CodeBlockNode,
	CommentNode,
	FrontmatterNode,
	InlineCodeNode,
	MarkdownLinkNode,
	MarkdownNode,
	RawHtmlNode,
	WikilinkNode,
} from "./nodes";

/** Frontmatter block at the start of the document */
const FRONTMATTER_PATTERN = /^\s*?---[\r\n][\s\S]*?[\r\n]---/;

/** A line that closes a fenced code block, allowing blockquote prefixes */
const CLOSING_FENCE_PATTERN = /^([ \t>]*)(`{3,}|~{3,})[ \t]*$/;

/** Characters allowed in a block identifier */
const BLOCK_ID_CHAR = /[\w-]/;

/** Pipes in wikilinks, tolerating the escaped form used inside tables */
const WIKILINK_PIPE = /\\?\|/;

const isNewline = (char: string | undefined): boolean =>
	char === "\n" || char === "\r";

const matchFrontmatter = (text: string): FrontmatterNode | null => {
	const match = FRONTMATTER_PATTERN.exec(text);

	if (!match) {
		return null;
	}

	const source = match[0];
	const bodyStart = source.indexOf("---") + 4;

	return {
		type: "frontmatter",
		start: 0,
		end: source.length,
		source,
		body: source.slice(bodyStart, source.length - 4),
	};
};

/**
 * A fenced code block. Only recognized when the fence starts a line
 * (allowing blockquote/callout prefixes, so "> ```dataview" works). The
 * node starts at the first fence character so the prefix stays outside it.
 */
const matchCodeFence = (text: string, pos: number): CodeBlockNode | null => {
	const fenceChar = text[pos];
	let run = 0;

	while (text[pos + run] === fenceChar) run++;

	if (run < 3) {
		return null;
	}

	const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
	const linePrefix = text.slice(lineStart, pos);

	if (!/^[ \t>]*$/.test(linePrefix)) {
		return null;
	}

	let openLineEnd = text.indexOf("\n", pos + run);

	if (openLineEnd === -1) {
		openLineEnd = text.length;
	}

	const infoRaw = text.slice(pos + run, openLineEnd);

	// An info string cannot contain backticks — "``` foo ```" on one line
	// is an inline code span, not a fence.
	if (fenceChar === "`" && infoRaw.includes("`")) {
		return null;
	}

	const insideBlockquote = linePrefix.includes(">");

	const makeNode = (
		end: number,
		body: string,
		closed: boolean,
	): CodeBlockNode => ({
		type: "codeblock",
		start: pos,
		end,
		source: text.slice(pos, end),
		info: infoRaw.trim(),
		body,
		cleanBody: insideBlockquote
			? body
					.split("\n")
					.map((line) => line.replace(/^[ \t]*(?:>[ \t]?)+/, ""))
					.join("\n")
			: body,
		linePrefix: insideBlockquote ? linePrefix : "",
		closed,
	});

	let searchPos = openLineEnd + 1;

	while (searchPos <= text.length) {
		let lineEnd = text.indexOf("\n", searchPos);

		if (lineEnd === -1) {
			lineEnd = text.length;
		}

		const closing = CLOSING_FENCE_PATTERN.exec(
			text.slice(searchPos, lineEnd),
		);

		if (
			closing &&
			closing[2][0] === fenceChar &&
			closing[2].length >= run
		) {
			const fenceIdx = searchPos + closing[1].length;

			return makeNode(
				fenceIdx + closing[2].length,
				text.slice(openLineEnd + 1, fenceIdx),
				true,
			);
		}

		if (lineEnd === text.length) {
			break;
		}
		searchPos = lineEnd + 1;
	}

	// No closing fence: the block runs to the end of the document, which
	// matches how Obsidian renders it.
	return makeNode(
		text.length,
		openLineEnd >= text.length ? "" : text.slice(openLineEnd + 1),
		false,
	);
};

/** An inline code span: a backtick run closed by an equal run on the same line */
const matchInlineCode = (text: string, pos: number): InlineCodeNode | null => {
	let run = 0;

	while (text[pos + run] === "`") run++;

	let lineEnd = text.indexOf("\n", pos);

	if (lineEnd === -1) {
		lineEnd = text.length;
	}

	const delimiter = "`".repeat(run);
	let search = pos + run;

	while (search < lineEnd) {
		const idx = text.indexOf(delimiter, search);

		if (idx === -1 || idx >= lineEnd) {
			return null;
		}

		let closeRun = 0;

		while (text[idx + closeRun] === "`") closeRun++;

		if (closeRun === run) {
			return {
				type: "inlinecode",
				start: pos,
				end: idx + run,
				source: text.slice(pos, idx + run),
				body: text.slice(pos + run, idx),
			};
		}
		search = idx + closeRun;
	}

	return null;
};

const matchComment = (text: string, pos: number): CommentNode | null => {
	if (!text.startsWith("%%", pos)) {
		return null;
	}

	// Require at least one character of content
	const close = text.indexOf("%%", pos + 3);

	if (close === -1) {
		return null;
	}

	return {
		type: "comment",
		start: pos,
		end: close + 2,
		source: text.slice(pos, close + 2),
		body: text.slice(pos + 2, close),
	};
};

const matchRawHtml = (
	text: string,
	lowerText: string,
	pos: number,
): RawHtmlNode | null => {
	for (const tag of ["script", "style"] as const) {
		if (!lowerText.startsWith(`<${tag}`, pos)) {
			continue;
		}

		const afterTag = text[pos + 1 + tag.length];

		if (afterTag !== ">" && !/\s/.test(afterTag ?? "")) {
			continue;
		}

		const closeIdx = lowerText.indexOf(`</${tag}`, pos);

		if (closeIdx === -1) {
			return null;
		}

		const closeEnd = text.indexOf(">", closeIdx);

		if (closeEnd === -1) {
			return null;
		}

		return {
			type: "rawhtml",
			start: pos,
			end: closeEnd + 1,
			source: text.slice(pos, closeEnd + 1),
			tag,
		};
	}

	return null;
};

const matchWikilink = (
	text: string,
	pos: number,
	embed: boolean,
): WikilinkNode | null => {
	const open = embed ? "![[" : "[[";

	if (!text.startsWith(open, pos)) {
		return null;
	}

	const innerStart = pos + open.length;
	const close = text.indexOf("]]", innerStart);

	if (close === -1 || close === innerStart) {
		return null;
	}

	const newline = text.indexOf("\n", innerStart);

	if (newline !== -1 && newline < close) {
		return null;
	}

	const inner = text.slice(innerStart, close);
	const parts = inner.split(WIKILINK_PIPE);
	const targetWithRef = parts[0];
	const hashIdx = targetWithRef.indexOf("#");

	return {
		type: "wikilink",
		start: pos,
		end: close + 2,
		source: text.slice(pos, close + 2),
		embed,
		inner,
		parts,
		targetWithRef,
		linkpath:
			hashIdx === -1 ? targetWithRef : targetWithRef.slice(0, hashIdx),
		ref: hashIdx === -1 ? "" : targetWithRef.slice(hashIdx),
	};
};

const matchMarkdownLink = (
	text: string,
	pos: number,
	embed: boolean,
): MarkdownLinkNode | null => {
	const bracket = embed ? pos + 1 : pos;

	if (text[bracket] !== "[") {
		return null;
	}

	const labelStart = bracket + 1;
	let labelEnd = labelStart;

	while (labelEnd < text.length) {
		const char = text[labelEnd];

		if (char === "]") {
			break;
		}

		if (char === "\n") {
			return null;
		}
		labelEnd++;
	}

	if (labelEnd >= text.length || text[labelEnd + 1] !== "(") {
		return null;
	}

	const destStart = labelEnd + 2;
	let destEnd = destStart;

	while (destEnd < text.length) {
		const char = text[destEnd];

		if (char === ")") {
			break;
		}

		if (char === "\n") {
			return null;
		}
		destEnd++;
	}

	if (destEnd >= text.length) {
		return null;
	}

	const destination = text.slice(destStart, destEnd);

	// A backtick in the destination means it holds an inline code span
	// (e.g. a dataview query: [kagi](`=this.url`)). Leave it as text so
	// the code span is parsed and can be evaluated on its own.
	if (destination.includes("`")) {
		return null;
	}

	return {
		type: "mdlink",
		start: pos,
		end: destEnd + 1,
		source: text.slice(pos, destEnd + 1),
		embed,
		label: text.slice(labelStart, labelEnd),
		destination,
	};
};

/**
 * A block identifier. minStart guards against claiming a preceding
 * space/newline that already belongs to an earlier node.
 */
const matchBlockId = (
	text: string,
	pos: number,
	minStart: number,
): BlockIdNode | null => {
	if (pos - 1 < minStart) {
		return null;
	}

	const prev = text[pos - 1];
	let idEnd = pos + 1;

	while (idEnd < text.length && BLOCK_ID_CHAR.test(text[idEnd])) idEnd++;

	if (idEnd === pos + 1) {
		return null;
	}

	const id = text.slice(pos + 1, idEnd);
	const after = text[idEnd];

	if (isNewline(prev) && isNewline(after)) {
		return {
			type: "blockid",
			start: pos - 1,
			end: idEnd + 1,
			source: text.slice(pos - 1, idEnd + 1),
			id,
			ownLine: true,
		};
	}

	if (prev === " " && (after === undefined || isNewline(after))) {
		return {
			type: "blockid",
			start: pos - 1,
			end: idEnd,
			source: text.slice(pos - 1, idEnd),
			id,
			ownLine: false,
		};
	}

	return null;
};

/**
 * Parse a markdown document into a flat list of nodes. Concatenating each
 * node's `source` reproduces the input exactly.
 */
export const parseMarkdown = (text: string): MarkdownNode[] => {
	const nodes: MarkdownNode[] = [];
	const lowerText = text.toLowerCase();

	let pos = 0;
	let textStart = 0;

	const pushText = (upTo: number) => {
		if (upTo > textStart) {
			nodes.push({
				type: "text",
				start: textStart,
				end: upTo,
				source: text.slice(textStart, upTo),
			});
		}
	};

	const frontmatter = matchFrontmatter(text);

	if (frontmatter) {
		nodes.push(frontmatter);
		pos = frontmatter.end;
		textStart = pos;
	}

	while (pos < text.length) {
		let node: MarkdownNode | null = null;

		switch (text[pos]) {
			case "`":
				node = matchCodeFence(text, pos) ?? matchInlineCode(text, pos);
				break;
			case "~":
				node = matchCodeFence(text, pos);
				break;
			case "%":
				node = matchComment(text, pos);
				break;
			case "!":
				node =
					matchWikilink(text, pos, true) ??
					matchMarkdownLink(text, pos, true);
				break;
			case "[":
				node =
					matchWikilink(text, pos, false) ??
					matchMarkdownLink(text, pos, false);
				break;
			case "^":
				node = matchBlockId(text, pos, textStart);
				break;
			case "<":
				node = matchRawHtml(text, lowerText, pos);
				break;
		}

		if (node) {
			pushText(node.start);
			nodes.push(node);
			pos = node.end;
			textStart = pos;
		} else {
			pos++;
		}
	}
	pushText(text.length);

	return nodes;
};
