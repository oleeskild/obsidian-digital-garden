import { MarkdownNode, parseMarkdown, serializeNodes } from "./index";

const nodesOfType = (text: string, type: MarkdownNode["type"]) =>
	parseMarkdown(text).filter((node) => node.type === type);

describe("parseMarkdown", () => {
	describe("losslessness", () => {
		const documents = [
			"",
			"plain text only",
			'---\n{"dg-publish":true}\n---\n# Hi\n\nSee [[Note|display]] and ![[img.png|100]].\n',
			"```js\nconst a = [[1, 2]];\n```\ninline `code` and %%comment%% and ^block-id\n",
			"| ![[garden-gate.svg\\|50]] | description |\n",
			"> [!note] Callout\n> ```dataview\n> LIST\n> ```\n",
			"Unclosed [[link and ![broken](no-close\nnext line\n",
			"<script>const data = [[1,2],[3,4]];</script> after\n",
			"a %% multi\nline comment %% b\n",
			"``literal ` backtick`` here\n",
			"~~~\ntilde fence [[not-a-link]]\n~~~\n",
			"text ^id-at-eof",
		];

		it.each(documents)("round-trips %j", (doc) => {
			expect(serializeNodes(parseMarkdown(doc))).toBe(doc);
		});
	});

	describe("frontmatter", () => {
		it("parses the frontmatter block at document start", () => {
			const [node] = parseMarkdown(
				'---\n{"dg-publish":true}\n---\nbody [[link]]',
			);

			expect(node.type).toBe("frontmatter");
			expect(node.source).toBe('---\n{"dg-publish":true}\n---');
		});

		it("does not treat links inside frontmatter as nodes", () => {
			const text = '---\ncover: "[[img.png]]"\n---\nbody';
			const links = nodesOfType(text, "wikilink");

			expect(links).toHaveLength(0);
		});

		it("does not parse frontmatter mid-document", () => {
			const text = "body\n---\nnot frontmatter\n---\n";

			expect(nodesOfType(text, "frontmatter")).toHaveLength(0);
		});
	});

	describe("code", () => {
		it("treats wikilinks, comments and block ids inside fences as code", () => {
			const text =
				"```\n[[link]] %%comment%% foo ^block-id\n```\noutside [[real]]\n";

			const nodes = parseMarkdown(text);

			expect(nodesOfType(text, "codeblock")).toHaveLength(1);
			expect(nodesOfType(text, "comment")).toHaveLength(0);
			expect(nodesOfType(text, "blockid")).toHaveLength(0);

			const links = nodes.filter((node) => node.type === "wikilink");
			expect(links).toHaveLength(1);
			expect(links[0].source).toBe("[[real]]");
		});

		it("parses the info string and body of a fence", () => {
			const [block] = nodesOfType(
				"```dataview\nLIST\nFROM #tag\n```\n",
				"codeblock",
			);

			expect(block.type === "codeblock" && block.info).toBe("dataview");

			expect(block.type === "codeblock" && block.body).toBe(
				"LIST\nFROM #tag\n",
			);
		});

		it("recognizes fences nested in callouts and keeps line prefixes", () => {
			const text = "> [!info]\n> ```dataview\n> LIST\n> ```\n";
			const [block] = nodesOfType(text, "codeblock");

			expect(block.type === "codeblock" && block.info).toBe("dataview");

			expect(block.type === "codeblock" && block.body).toBe("> LIST\n> ");

			// …while cleanBody has the markers stripped for consumers
			expect(block.type === "codeblock" && block.cleanBody).toBe(
				"LIST\n",
			);

			expect(block.type === "codeblock" && block.linePrefix).toBe("> ");

			// The callout marker before the fence stays outside the node
			expect(block.source.startsWith("```")).toBe(true);
		});

		it("strips all nesting levels into cleanBody", () => {
			const text = "> > ```dataview\n> > LIST\n> > ```\n";
			const [block] = nodesOfType(text, "codeblock");

			expect(block.type === "codeblock" && block.cleanBody).toBe(
				"LIST\n",
			);

			expect(block.type === "codeblock" && block.linePrefix).toBe("> > ");
		});

		it("keeps cleanBody equal to body outside blockquotes", () => {
			const [block] = nodesOfType(
				"```js\nconst a = 1;\n```",
				"codeblock",
			);

			expect(
				block.type === "codeblock" && block.cleanBody === block.body,
			).toBe(true);

			expect(block.type === "codeblock" && block.linePrefix).toBe("");
		});

		it("runs an unclosed fence to the end of the document", () => {
			const text = "```\n[[swallowed]]\nstill code";
			const [block] = nodesOfType(text, "codeblock");

			expect(block.type === "codeblock" && block.closed).toBe(false);
			expect(block.end).toBe(text.length);
			expect(nodesOfType(text, "wikilink")).toHaveLength(0);
		});

		it("protects inline code spans", () => {
			const text = "a `[[not-a-link]]` b";

			expect(nodesOfType(text, "wikilink")).toHaveLength(0);
			expect(nodesOfType(text, "inlinecode")).toHaveLength(1);
		});

		it("treats ``` with backticks on the same line as inline code", () => {
			const text = "` code ` and more";
			const [span] = nodesOfType(text, "inlinecode");

			expect(span.type === "inlinecode" && span.body).toBe(" code ");
		});
	});

	describe("comments", () => {
		it("parses single and multi-line comments", () => {
			const text = "a %%one%% b %% multi\nline %% c";
			const comments = nodesOfType(text, "comment");

			expect(comments.map((node) => node.source)).toEqual([
				"%%one%%",
				"%% multi\nline %%",
			]);
		});

		it("leaves an unterminated %% as text", () => {
			expect(nodesOfType("a %% b", "comment")).toHaveLength(0);
		});
	});

	describe("wikilinks", () => {
		it("parses target, ref and alias", () => {
			const [link] = nodesOfType(
				"See [[folder/Note#Header|display]].",
				"wikilink",
			);

			if (link.type !== "wikilink") throw new Error("expected wikilink");

			expect(link.embed).toBe(false);
			expect(link.linkpath).toBe("folder/Note");
			expect(link.ref).toBe("#Header");
			expect(link.parts).toEqual(["folder/Note#Header", "display"]);
		});

		it("marks ![[...]] as embeds", () => {
			const [link] = nodesOfType("![[img.png|100]]", "wikilink");

			if (link.type !== "wikilink") throw new Error("expected wikilink");

			expect(link.embed).toBe(true);
			expect(link.parts).toEqual(["img.png", "100"]);
		});

		it("handles escaped pipes used in tables", () => {
			const [link] = nodesOfType(
				"| ![[garden-gate.svg\\|50]] | description |",
				"wikilink",
			);

			if (link.type !== "wikilink") throw new Error("expected wikilink");

			expect(link.embed).toBe(true);
			expect(link.source).toBe("![[garden-gate.svg\\|50]]");
			expect(link.parts).toEqual(["garden-gate.svg", "50"]);
		});

		it("does not span newlines", () => {
			expect(nodesOfType("[[broken\nlink]]", "wikilink")).toHaveLength(0);
		});
	});

	describe("markdown links", () => {
		it("parses links and images", () => {
			const text = "[label](target.md#Frag) and ![alt](img.png)";
			const links = nodesOfType(text, "mdlink");

			expect(links).toHaveLength(2);

			if (links[0].type !== "mdlink" || links[1].type !== "mdlink") {
				throw new Error("expected mdlinks");
			}

			expect(links[0].embed).toBe(false);
			expect(links[0].label).toBe("label");
			expect(links[0].destination).toBe("target.md#Frag");
			expect(links[1].embed).toBe(true);
			expect(links[1].label).toBe("alt");
			expect(links[1].destination).toBe("img.png");
		});

		it("leaves links with inline code destinations as text", () => {
			// [kagi](`=this.url`) — the code span holds a dataview query
			// that must stay evaluatable
			const text = "[kagi](`=this.url`)";

			expect(nodesOfType(text, "mdlink")).toHaveLength(0);

			const [span] = nodesOfType(text, "inlinecode");
			expect(span.type === "inlinecode" && span.body).toBe("=this.url");
		});

		it("ignores footnotes and reference-style links", () => {
			expect(
				nodesOfType("a footnote[^1] and [ref][style]", "mdlink"),
			).toHaveLength(0);
		});
	});

	describe("block ids", () => {
		it("parses a trailing block id", () => {
			const [id] = nodesOfType("some text ^block-id-1234\n", "blockid");

			if (id.type !== "blockid") throw new Error("expected blockid");

			expect(id.id).toBe("block-id-1234");
			expect(id.ownLine).toBe(false);
			expect(id.source).toBe(" ^block-id-1234");
		});

		it("parses a block id on its own line", () => {
			const [id] = nodesOfType("paragraph\n^my-id\nnext", "blockid");

			if (id.type !== "blockid") throw new Error("expected blockid");

			expect(id.id).toBe("my-id");
			expect(id.ownLine).toBe(true);
			expect(id.source).toBe("\n^my-id\n");
		});

		it("parses a block id at end of file", () => {
			const [id] = nodesOfType("text ^id-at-eof", "blockid");

			expect(id.type === "blockid" && id.id).toBe("id-at-eof");
		});

		it("does not treat mid-line carets as block ids", () => {
			expect(nodesOfType("2^10 = 1024", "blockid")).toHaveLength(0);

			expect(nodesOfType("a ^caret mid-line", "blockid")).toHaveLength(0);
		});
	});

	describe("raw html", () => {
		it("protects script contents from markdown parsing", () => {
			const text =
				'<script>const InitialData={"points":[[1,2],[3,4]]};</script>';

			expect(nodesOfType(text, "rawhtml")).toHaveLength(1);
			expect(nodesOfType(text, "wikilink")).toHaveLength(0);
		});

		it("protects style contents", () => {
			const text = "<style>.a { color: red; }</style> [[link]]";

			expect(nodesOfType(text, "rawhtml")).toHaveLength(1);
			expect(nodesOfType(text, "wikilink")).toHaveLength(1);
		});
	});
});
