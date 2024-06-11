import { replaceBlockIDs } from "./replaceBlockIDs";

describe("replaceBlockIDs", () => {
	it("should replace block IDs in markdown", () => {
		const EXPECTED_MARKDOWN = `
			# header

			foo ^block-id-1234

			bar ^block-id-5678
		`;

		const result = replaceBlockIDs(EXPECTED_MARKDOWN);

		expect(result).toBe(`
			# header

			foo
{ #block-id-1234}


			bar
{ #block-id-5678}

		`);
	});

	it("should not replace block IDs in code blocks", () => {
		const CODEBLOCK_WITH_BLOCKIDS = `
\`\`\`
foobar.
this is a code block.
but it contains a block ID to try to fool the compiler
and, consequently, wreck your garden.
here it goes: ^block-id-1234
and for fun, here's another: ^block-id-5678
\`\`\`

additionally, block IDs outside of code blocks should be replaced
for example, ^block-id-9999
and ^block-id-0000
		`;

		const result = replaceBlockIDs(CODEBLOCK_WITH_BLOCKIDS);

		expect(result).toBe(`
\`\`\`
foobar.
this is a code block.
but it contains a block ID to try to fool the compiler
and, consequently, wreck your garden.
here it goes: ^block-id-1234
and for fun, here's another: ^block-id-5678
\`\`\`

additionally, block IDs outside of code blocks should be replaced
for example,
{ #block-id-9999}

and
{ #block-id-0000}

		`);
	});
});
