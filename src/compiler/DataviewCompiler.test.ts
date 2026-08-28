import { getAPI } from "obsidian-dataview";
import { DataviewCompiler } from "./DataviewCompiler";
import { PublishFile } from "../publishFile/PublishFile";

jest.mock("obsidian", () => ({
	Component: class {
		load() {}
	},
	Notice: jest.fn(),
}));

jest.mock("obsidian-dataview", () => ({
	getAPI: jest.fn(),
}));

describe("DataviewCompiler", () => {
	const file = {
		getPath: () => "notes/test.md",
	} as unknown as PublishFile;

	const mockApi = (overrides: Record<string, unknown> = {}) => {
		const api = {
			settings: {
				dataviewJsKeyword: "dataviewjs",
				inlineQueryPrefix: "=",
				inlineJsQueryPrefix: "$=",
			},
			tryQueryMarkdown: jest.fn(
				async (_query: string, _path: string) => "- [[A]]\n- [[B]]",
			),
			tryEvaluate: jest.fn(
				(_query: string, _ctx: unknown) => "evaluated",
			),
			page: jest.fn(() => ({})),
			...overrides,
		};

		jest.mocked(getAPI).mockReturnValue(
			api as unknown as ReturnType<typeof getAPI>,
		);

		return api;
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("compiles a plain dataview block and appends the language tag", async () => {
		const api = mockApi();

		const result = await new DataviewCompiler().compile(file)(
			"```dataview\nLIST FROM #tag\n```",
		);

		expect(api.tryQueryMarkdown).toHaveBeenCalledWith(
			"LIST FROM #tag\n",
			"notes/test.md",
		);

		expect(result).toBe("- [[A]]\n- [[B]]\n{ .block-language-dataview}");
	});

	it("strips callout markers from the query and re-prefixes the output", async () => {
		const api = mockApi();

		const text =
			"> [!info] Lessons\n" +
			"> ```dataview\n" +
			'> list from "lessons"\n' +
			"> ```\n";

		const result = await new DataviewCompiler().compile(file)(text);

		// The block body keeps its "> " prefixes, but the query handed to
		// dataview must not contain them.
		const query = api.tryQueryMarkdown.mock.calls[0][0];
		expect(query).toBe('list from "lessons"\n');
		expect(query).not.toContain(">");

		// The rendered markdown goes back inside the callout, and the
		// callout's own "> " before the fence survives replacement.
		expect(result).toBe(
			"> [!info] Lessons\n" +
				">  - [[A]]\n" +
				"> - [[B]]\n" +
				"{ .block-language-dataview}\n",
		);
	});

	it("handles nested callouts: clean query in, full prefix back out", async () => {
		const api = mockApi();

		const text =
			"> [!info] Outer\n" +
			"> > [!note] Inner\n" +
			"> > ```dataview\n" +
			"> > LIST\n" +
			"> > ```\n";

		const result = await new DataviewCompiler().compile(file)(text);

		expect(api.tryQueryMarkdown).toHaveBeenCalledWith(
			"LIST\n",
			"notes/test.md",
		);

		expect(result).toBe(
			"> [!info] Outer\n" +
				"> > [!note] Inner\n" +
				"> >  - [[A]]\n" +
				"> > - [[B]]\n" +
				"{ .block-language-dataview}\n",
		);
	});

	it("evaluates inline queries", async () => {
		const api = mockApi({ tryEvaluate: jest.fn(() => "my-note") });

		const result = await new DataviewCompiler().compile(file)(
			"Name: `= this.file.name`",
		);

		expect(api.tryEvaluate).toHaveBeenCalledWith("this.file.name", {
			this: {},
		});
		expect(result).toBe("Name: my-note");
	});

	it("evaluates inline queries inside markdown link destinations", async () => {
		mockApi({ tryEvaluate: jest.fn(() => "https://kagi.com") });

		const result = await new DataviewCompiler().compile(file)(
			"A link: [kagi](`=this.url`)",
		);

		expect(result).toBe("A link: [kagi](https://kagi.com)");
	});

	it("stringifies non-string inline js results", async () => {
		mockApi({ tryEvaluate: jest.fn(() => 130) });

		const result = await new DataviewCompiler().compile(file)(
			"`$=dv.pages().length + dv.pages().length`",
		);

		expect(result).toBe("130");
	});

	it("leaves dataview syntax inside plain code blocks untouched", async () => {
		const api = mockApi();

		const text = "````md\n```dataview\nLIST\n```\n````";

		const result = await new DataviewCompiler().compile(file)(text);

		expect(api.tryQueryMarkdown).not.toHaveBeenCalled();
		expect(result).toBe(text);
	});

	it("leaves a failing block in place instead of replacing the page", async () => {
		mockApi({
			tryQueryMarkdown: jest.fn(async () => {
				throw new Error("bad query");
			}),
		});

		const text = "before\n```dataview\nLIST\n```\nafter";

		const result = await new DataviewCompiler().compile(file)(text);

		expect(result).toBe(text);
	});
});
