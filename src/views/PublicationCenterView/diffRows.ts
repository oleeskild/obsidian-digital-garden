import * as Diff from "diff";

export type UnifiedRow =
	| { type: "add"; text: string; newLineNo: number }
	| { type: "del"; text: string; oldLineNo: number }
	| { type: "context"; text: string; oldLineNo: number; newLineNo: number }
	| { type: "gap"; hiddenCount: number };

export interface SplitCell {
	text: string;
	lineNo: number;
	type: "add" | "del" | "context";
}

export interface SplitRow {
	left?: SplitCell;
	right?: SplitCell;
}

function splitLines(value: string): string[] {
	const lines = value.split("\n");

	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

	return lines;
}

export function computeUnifiedRows(
	changes: Diff.Change[],
	contextLines = 3,
): UnifiedRow[] {
	const all: UnifiedRow[] = [];
	let oldLine = 0;
	let newLine = 0;

	for (const part of changes) {
		for (const text of splitLines(part.value)) {
			if (part.added) {
				newLine++;
				all.push({ type: "add", text, newLineNo: newLine });
			} else if (part.removed) {
				oldLine++;
				all.push({ type: "del", text, oldLineNo: oldLine });
			} else {
				oldLine++;
				newLine++;

				all.push({
					type: "context",
					text,
					oldLineNo: oldLine,
					newLineNo: newLine,
				});
			}
		}
	}

	if (!Number.isFinite(contextLines)) return all;

	const isChange = (r: UnifiedRow) => r.type === "add" || r.type === "del";
	const keep = new Array(all.length).fill(false);

	for (let i = 0; i < all.length; i++) {
		if (!isChange(all[i])) continue;
		keep[i] = true;

		for (let d = 1; d <= contextLines; d++) {
			if (i - d >= 0) keep[i - d] = true;

			if (i + d < all.length) keep[i + d] = true;
		}
	}

	const result: UnifiedRow[] = [];
	let hidden = 0;

	for (let i = 0; i < all.length; i++) {
		if (keep[i]) {
			if (hidden > 0) {
				result.push({ type: "gap", hiddenCount: hidden });
				hidden = 0;
			}
			result.push(all[i]);
		} else {
			hidden++;
		}
	}

	if (hidden > 0) result.push({ type: "gap", hiddenCount: hidden });

	return result;
}

export function computeSplitRows(changes: Diff.Change[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let oldLine = 0;
	let newLine = 0;
	let delBuf: string[] = [];
	let addBuf: string[] = [];

	const flush = () => {
		const n = Math.max(delBuf.length, addBuf.length);

		for (let i = 0; i < n; i++) {
			const row: SplitRow = {};

			if (i < delBuf.length) {
				oldLine++;
				row.left = { text: delBuf[i], lineNo: oldLine, type: "del" };
			}

			if (i < addBuf.length) {
				newLine++;
				row.right = { text: addBuf[i], lineNo: newLine, type: "add" };
			}
			rows.push(row);
		}
		delBuf = [];
		addBuf = [];
	};

	for (const part of changes) {
		const lines = splitLines(part.value);

		if (part.removed) {
			delBuf.push(...lines);
		} else if (part.added) {
			addBuf.push(...lines);
		} else {
			flush();

			for (const text of lines) {
				oldLine++;
				newLine++;

				rows.push({
					left: { text, lineNo: oldLine, type: "context" },
					right: { text, lineNo: newLine, type: "context" },
				});
			}
		}
	}

	flush();

	return rows;
}
