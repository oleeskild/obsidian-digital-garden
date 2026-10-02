import { Vault } from "obsidian";
import Logger from "js-logger";
import { TCompilerStep } from "./GardenPageCompiler";
import { transformMarkdownSync } from "./ast";

export interface FtcColor {
	id: string;
	color: string;
	italic?: boolean;
	bold?: boolean;
	cap_mode?: { state: string };
	line_mode?: { state: string };
	useCssColorVariable?: boolean;
	colorVariable?: string;
}

export interface FtcSettings {
	themes: Array<{ name: string; colors: FtcColor[] }>;
	themeIndex: number;
}

const builtin = (id: string): FtcColor => ({
	id,
	color: "#000000",
	useCssColorVariable: true,
	colorVariable: `--color-${id}`,
});

// What Fast Text Color uses until the user changes a setting; it only
// writes data.json after that, so a fresh install has no file to read.
export const DEFAULT_FTC_SETTINGS: FtcSettings = {
	themeIndex: 0,
	themes: [
		{
			name: "builtin",
			colors: [
				"red",
				"orange",
				"yellow",
				"green",
				"cyan",
				"blue",
				"purple",
				"pink",
			].map(builtin),
		},
		{
			name: "default",
			colors: [
				{ id: "red", color: "#ff0000" },
				{ id: "green", color: "#00ff00" },
				{ id: "blue", color: "#0000ff" },
				{ id: "cyan", color: "#00ffff" },
				{ id: "magenta", color: "#ff00ff" },
				{ id: "yellow", color: "#ffff00" },
				{ id: "black", color: "#000000" },
			],
		},
	],
};

// Opening delimiter, closing delimiter, or a blank line (which ends a colored section)
const TOKEN = /~=\{([^\s}]+)\}|=~|\n[ \t]*\n/g;

type VariableResolver = (name: string) => string;

// The published site may not define Obsidian's color variables, so the
// value Obsidian shows at publish time is baked in as the fallback.
const resolveCssVariable: VariableResolver = (name) => {
	const value = getComputedStyle(document.body).getPropertyValue(name).trim();

	return value ? `var(${name}, ${value})` : `var(${name})`;
};

export const toInlineStyle = (
	color: FtcColor,
	resolveVariable: VariableResolver = resolveCssVariable,
): string =>
	[
		`color: ${
			color.useCssColorVariable && color.colorVariable
				? resolveVariable(color.colorVariable)
				: color.color
		}`,
		color.italic && "font-style: italic",
		color.bold && "font-weight: bold",
		color.line_mode?.state &&
			color.line_mode.state !== "none" &&
			`text-decoration: ${color.line_mode.state}`,
		color.cap_mode?.state === "all_caps" && "text-transform: uppercase",
		color.cap_mode?.state === "small_caps" && "font-variant: small-caps",
	]
		.filter(Boolean)
		.join("; ")
		.replace(/"/g, "&quot;");

/**
 * Convert Fast Text Color sections (~={id}text=~) to inline-styled spans.
 * Sections with an id the theme doesn't know are left as written.
 */
export const convertFastTextColor = (
	text: string,
	themeName: string,
	colors: FtcColor[],
	resolveVariable?: VariableResolver,
): string => {
	// true = a span was opened for this section, false = unknown id left as-is
	const open: boolean[] = [];

	const closeAll = () =>
		"</span>".repeat(open.splice(0).filter(Boolean).length);

	const converted = transformMarkdownSync(text, (node) => {
		if (node.type === "codeblock" || node.type === "frontmatter") {
			return open.length ? closeAll() + node.source : undefined;
		}

		if (node.type !== "text") {
			return;
		}

		return node.source.replace(TOKEN, (match: string, id?: string) => {
			if (id) {
				const color = colors.find((c) => c.id === id);
				open.push(!!color);

				return color
					? `<span class="ftc-color-${themeName}-${id}" style="${toInlineStyle(
							color,
							resolveVariable,
					  )}">`
					: match;
			}

			if (match === "=~") {
				// a stray "=~" with nothing open is ordinary text
				return open.pop() ? "</span>" : match;
			}

			return closeAll() + match;
		});
	});

	return converted + closeAll();
};

export class FastTextColorCompiler {
	constructor(private readonly vault: Vault) {}

	compile: TCompilerStep = (file) => async (text) => {
		if (!text.includes("~={")) {
			return text;
		}

		const settings = await this.loadSettings();

		if (!settings) {
			return text;
		}

		const themeName =
			file.frontmatter?.["ftcTheme"] ??
			settings.themes[settings.themeIndex]?.name;

		const theme = settings.themes.find((t) => t.name === themeName);

		if (!theme) {
			return text;
		}

		return convertFastTextColor(text, theme.name, theme.colors);
	};

	private async loadSettings(): Promise<FtcSettings | null> {
		const pluginDir = `${this.vault.configDir}/plugins/fast-text-color`;

		try {
			// Not installed: leave the syntax alone
			if (
				!(await this.vault.adapter.exists(`${pluginDir}/manifest.json`))
			) {
				return null;
			}

			if (!(await this.vault.adapter.exists(`${pluginDir}/data.json`))) {
				return DEFAULT_FTC_SETTINGS;
			}

			return {
				...DEFAULT_FTC_SETTINGS,
				...JSON.parse(
					await this.vault.adapter.read(`${pluginDir}/data.json`),
				),
			};
		} catch (error) {
			Logger.warn("Could not read Fast Text Color settings", error);

			return null;
		}
	}
}
