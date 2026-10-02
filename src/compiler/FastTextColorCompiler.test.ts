import { Vault } from "obsidian";
import {
	convertFastTextColor,
	FastTextColorCompiler,
	FtcColor,
	toInlineStyle,
} from "./FastTextColorCompiler";
import { PublishFile } from "../publishFile/PublishFile";

jest.mock("obsidian", () => ({}));

const COLORS: FtcColor[] = [
	{ id: "red", color: "#ff0000" },
	{ id: "blue", color: "#0000ff", bold: true },
];

const convert = (text: string) => convertFastTextColor(text, "t", COLORS);

const RED = `<span class="ftc-color-t-red" style="color: #ff0000">`;
const BLUE = `<span class="ftc-color-t-blue" style="color: #0000ff; font-weight: bold">`;

describe("convertFastTextColor", () => {
	it("converts a single section", () => {
		expect(convert("some ~={red}colored=~ text")).toBe(
			`some ${RED}colored</span> text`,
		);
	});

	it("converts two sections on the same line", () => {
		expect(convert("a ~={red}b=~ c ~={blue}d=~ e")).toBe(
			`a ${RED}b</span> c ${BLUE}d</span> e`,
		);
	});

	it("converts nested sections", () => {
		expect(convert("~={red}a ~={blue}b=~ c=~")).toBe(
			`${RED}a ${BLUE}b</span> c</span>`,
		);
	});

	it("keeps links and formatting inside a section", () => {
		expect(convert("~={red}see [[Note|alias]] and **bold**=~")).toBe(
			`${RED}see [[Note|alias]] and **bold**</span>`,
		);
	});

	it("leaves delimiters in inline code untouched", () => {
		const text = "use `~={red}x=~` here";

		expect(convert(text)).toBe(text);
	});

	it("leaves delimiters in code blocks untouched", () => {
		const text = "```\n~={red}x=~\n```\n";

		expect(convert(text)).toBe(text);
	});

	it("leaves a section with an unknown id as written", () => {
		const text = "a ~={nope}b=~ c";

		expect(convert(text)).toBe(text);
	});

	it("does not let an unknown section close an outer one early", () => {
		expect(convert("~={red}a ~={nope}b=~ c=~")).toBe(
			`${RED}a ~={nope}b=~ c</span>`,
		);
	});

	it("leaves a stray closing delimiter as written", () => {
		const text = "if (x =~ /re/) then";

		expect(convert(text)).toBe(text);
	});

	it("closes an unclosed section at a blank line", () => {
		expect(convert("~={red}open\n\nnext paragraph")).toBe(
			`${RED}open</span>\n\nnext paragraph`,
		);
	});

	it("closes an unclosed section at the end of the document", () => {
		expect(convert("~={red}open")).toBe(`${RED}open</span>`);
	});

	it("closes an unclosed section before a code block", () => {
		expect(convert("~={red}open\n```\ncode\n```\n")).toBe(
			`${RED}open\n</span>\`\`\`\ncode\n\`\`\`\n`,
		);
	});
});

describe("toInlineStyle", () => {
	it("includes all formatting options", () => {
		expect(
			toInlineStyle({
				id: "x",
				color: "#123456",
				italic: true,
				bold: true,
				line_mode: { state: "underline" },
				cap_mode: { state: "small_caps" },
			}),
		).toBe(
			"color: #123456; font-style: italic; font-weight: bold; text-decoration: underline; font-variant: small-caps",
		);
	});

	it("ignores disabled line and cap modes", () => {
		expect(
			toInlineStyle({
				id: "x",
				color: "#123456",
				line_mode: { state: "none" },
				cap_mode: { state: "normal" },
			}),
		).toBe("color: #123456");
	});

	it("resolves css variable colors", () => {
		expect(
			toInlineStyle(
				{
					id: "red",
					color: "#000000",
					useCssColorVariable: true,
					colorVariable: "--color-red",
				},
				(name) => `var(${name}, #e93147)`,
			),
		).toBe("color: var(--color-red, #e93147)");
	});
});

describe("FastTextColorCompiler", () => {
	const PLUGIN_DIR = ".obsidian/plugins/fast-text-color";

	const getCompiler = (files: Record<string, string>) =>
		new FastTextColorCompiler({
			configDir: ".obsidian",
			adapter: {
				exists: async (path: string) => path in files,
				read: async (path: string) => files[path],
			},
		} as unknown as Vault);

	const file = (frontmatter: Record<string, unknown> = {}) =>
		({ frontmatter }) as unknown as PublishFile;

	const DATA = JSON.stringify({
		themeIndex: 0,
		themes: [
			{ name: "mine", colors: [{ id: "red", color: "#aa0000" }] },
			{ name: "other", colors: [{ id: "red", color: "#00aa00" }] },
		],
	});

	it("leaves text alone when the plugin is not installed", async () => {
		const text = "~={red}x=~";

		expect(await getCompiler({}).compile(file())(text)).toBe(text);
	});

	it("uses the active theme from the plugin settings", async () => {
		const compiler = getCompiler({
			[`${PLUGIN_DIR}/manifest.json`]: "{}",
			[`${PLUGIN_DIR}/data.json`]: DATA,
		});

		expect(await compiler.compile(file())("~={red}x=~")).toBe(
			`<span class="ftc-color-mine-red" style="color: #aa0000">x</span>`,
		);
	});

	it("lets the ftcTheme property override the active theme", async () => {
		const compiler = getCompiler({
			[`${PLUGIN_DIR}/manifest.json`]: "{}",
			[`${PLUGIN_DIR}/data.json`]: DATA,
		});

		expect(
			await compiler.compile(file({ ftcTheme: "other" }))("~={red}x=~"),
		).toBe(
			`<span class="ftc-color-other-red" style="color: #00aa00">x</span>`,
		);
	});

	it("falls back to the default palette when no settings are saved", async () => {
		const compiler = getCompiler({
			[`${PLUGIN_DIR}/manifest.json`]: "{}",
		});

		expect(
			await compiler.compile(file({ ftcTheme: "default" }))(
				"~={magenta}x=~",
			),
		).toBe(
			`<span class="ftc-color-default-magenta" style="color: #ff00ff">x</span>`,
		);
	});
});
