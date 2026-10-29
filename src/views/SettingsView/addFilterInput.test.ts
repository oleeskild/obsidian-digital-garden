import { regexError } from "./addFilterInput";

describe("regexError", () => {
	it("accepts valid patterns and empty ones", () => {
		expect(regexError(":smile:", "g")).toBeNull();
		expect(regexError("", "g")).toBeNull();
	});

	it("explains invalid patterns and flags", () => {
		expect(regexError("(unclosed", "g")).toMatch(/./);
		expect(regexError("ok", "zz")).toMatch(/./);
	});
});
