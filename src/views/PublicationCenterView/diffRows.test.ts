import * as Diff from "diff";
import { computeUnifiedRows, computeSplitRows } from "./diffRows";

describe("computeUnifiedRows", () => {
	it("numbers added, removed and context lines", () => {
		const changes = Diff.diffLines("a\nb\nc\n", "a\nB\nc\n");
		const rows = computeUnifiedRows(changes, Infinity);

		expect(rows).toEqual([
			{ type: "context", text: "a", oldLineNo: 1, newLineNo: 1 },
			{ type: "del", text: "b", oldLineNo: 2 },
			{ type: "add", text: "B", newLineNo: 2 },
			{ type: "context", text: "c", oldLineNo: 3, newLineNo: 3 },
		]);
	});

	it("collapses long unchanged runs into a gap row", () => {
		const oldText = "change\n" + "x\n".repeat(20);
		const newText = "CHANGE\n" + "x\n".repeat(20);
		const rows = computeUnifiedRows(Diff.diffLines(oldText, newText), 2);

		// first two rows are the change
		expect(rows[0]).toEqual({ type: "del", text: "change", oldLineNo: 1 });
		expect(rows[1]).toEqual({ type: "add", text: "CHANGE", newLineNo: 1 });
		// then 2 context lines, then a gap row covering the rest
		expect(rows[2].type).toBe("context");
		expect(rows[3].type).toBe("context");
		const gap = rows.find((r) => r.type === "gap");
		expect(gap).toBeDefined();
		expect((gap as { hiddenCount: number }).hiddenCount).toBe(18);
	});
});

describe("computeSplitRows", () => {
	it("pairs removed lines on the left with added lines on the right", () => {
		const changes = Diff.diffLines("a\nb\nc\n", "a\nB\nc\n");
		const rows = computeSplitRows(changes);

		expect(rows[0]).toEqual({
			left: { text: "a", lineNo: 1, type: "context" },
			right: { text: "a", lineNo: 1, type: "context" },
		});

		expect(rows[1]).toEqual({
			left: { text: "b", lineNo: 2, type: "del" },
			right: { text: "B", lineNo: 2, type: "add" },
		});

		expect(rows[2]).toEqual({
			left: { text: "c", lineNo: 3, type: "context" },
			right: { text: "c", lineNo: 3, type: "context" },
		});
	});

	it("leaves the opposite cell empty when sides are uneven", () => {
		// pure insertion: one removed line gone, two added
		const changes = Diff.diffLines("a\n", "a\nb\nc\n");
		const rows = computeSplitRows(changes);
		const added = rows.filter((r) => r.right && !r.left);
		expect(added.map((r) => r.right!.text)).toEqual(["b", "c"]);
	});
});
