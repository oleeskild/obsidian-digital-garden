import { Component, Notice } from "obsidian";
import { TCompilerStep } from "./GardenPageCompiler";
import { DataviewApi, getAPI } from "obsidian-dataview";
import { PublishFile } from "src/publishFile/PublishFile";
import Logger from "js-logger";
import { CodeBlockNode, transformMarkdown } from "./ast";

export class DataviewCompiler {
	constructor() {}

	compile: TCompilerStep = (file) => async (text) => {
		const dvApi = getAPI();

		if (!dvApi) return text;

		const dataviewJsKeyword = dvApi.settings.dataviewJsKeyword;
		const inlineQueryPrefix = dvApi.settings.inlineQueryPrefix;
		const inlineJsQueryPrefix = dvApi.settings.inlineJsQueryPrefix;

		return await transformMarkdown(text, async (node) => {
			if (node.type === "codeblock") {
				if (node.info === "dataview") {
					return this.compileDataviewBlock(node, file, dvApi);
				}

				if (dataviewJsKeyword && node.info === dataviewJsKeyword) {
					return this.compileDataviewJsBlock(node, file, dvApi);
				}

				return;
			}

			if (node.type === "inlinecode") {
				if (
					inlineQueryPrefix &&
					node.body.startsWith(inlineQueryPrefix)
				) {
					return this.compileInlineQuery(
						node.body.slice(inlineQueryPrefix.length),
						file,
						dvApi,
					);
				}

				if (
					inlineJsQueryPrefix &&
					node.body.startsWith(inlineJsQueryPrefix)
				) {
					return this.compileInlineJsQuery(
						node.body.slice(inlineJsQueryPrefix.length),
						file,
						dvApi,
					);
				}
			}

			return;
		});
	};

	private async compileDataviewBlock(
		node: CodeBlockNode,
		file: PublishFile,
		dvApi: DataviewApi,
	): Promise<string | undefined> {
		try {
			// The parser strips callout markers into cleanBody and records
			// the callout prefix, so the query needs no re-parsing here.
			let markdown = await dvApi.tryQueryMarkdown(
				node.cleanBody,
				file.getPath(),
			);

			if (node.linePrefix) {
				markdown = this.surroundWithCalloutBlock(
					markdown,
					node.linePrefix,
				);
			}

			return `${markdown}\n{ .block-language-dataview}`;
		} catch (e) {
			console.log(e);

			new Notice(
				"Unable to render dataview query. Please update the dataview plugin to the latest version.",
			);

			return undefined;
		}
	}

	private async compileDataviewJsBlock(
		node: CodeBlockNode,
		file: PublishFile,
		dvApi: DataviewApi,
	): Promise<string | undefined> {
		try {
			const div = createEl("div");
			const component = new Component();
			component.load();

			await dvApi.executeJs(
				node.cleanBody,
				div,
				component,
				file.getPath(),
			);
			let counter = 0;

			while (!div.querySelector("[data-tag-name]") && counter < 100) {
				await delay(5);
				counter++;
			}

			return div.innerHTML ?? "";
		} catch (e) {
			console.log(e);

			new Notice(
				"Unable to render dataviewjs query. Please update the dataview plugin to the latest version.",
			);

			return undefined;
		}
	}

	private compileInlineQuery(
		query: string,
		file: PublishFile,
		dvApi: DataviewApi,
	): string | undefined {
		try {
			const dataviewResult = dvApi.tryEvaluate(query.trim(), {
				this: dvApi.page(file.getPath()) ?? {},
			});

			if (dataviewResult) {
				return dataviewResult.toString() ?? "";
			}

			return undefined;
		} catch (e) {
			console.log(e);

			new Notice(
				"Unable to render inline dataview query. Please update the dataview plugin to the latest version.",
			);

			return undefined;
		}
	}

	private async compileInlineJsQuery(
		query: string,
		file: PublishFile,
		dvApi: DataviewApi,
	): Promise<string | undefined> {
		try {
			let result: string | undefined | null = "";

			result = tryDVEvaluate(query, file, dvApi);

			if (!result) {
				result = tryEval(query);
			}

			if (!result) {
				result = await tryExecuteJs(query, file, dvApi);
			}

			// Evaluation can yield non-strings (e.g. a number); the
			// transform only applies string replacements.
			return String(result ?? "Unable to render query");
		} catch (e) {
			Logger.error(e);

			new Notice(
				"Unable to render inline dataviewjs query. Please update the dataview plugin to the latest version.",
			);

			return undefined;
		}
	}

	/**
	 * Put rendered markdown back inside the callout the query came from:
	 * every line after the first gets the callout's own prefix (which may
	 * be nested, e.g. "> > "). The first line continues the "> " that
	 * survives in front of the replaced code block.
	 */
	surroundWithCalloutBlock(input: string, linePrefix: string): string {
		return " " + input.split("\n").join("\n" + linePrefix);
	}
}

function tryDVEvaluate(
	query: string,
	file: PublishFile,
	dvApi: DataviewApi,
): string | undefined | null {
	let result = "";

	try {
		const dataviewResult = dvApi.tryEvaluate(query.trim(), {
			this: dvApi.page(file.getPath()) ?? {},
		});
		result = dataviewResult?.toString() ?? "";
	} catch (e) {
		Logger.warn("dvapi.tryEvaluate did not yield any result", e);
	}

	return result;
}

function tryEval(query: string) {
	let result = "";

	try {
		const evaluateQuery = new Function("dv", `return ${query}`);

		result = evaluateQuery(
			(window as unknown as { DataviewAPI?: unknown }).DataviewAPI,
		);
	} catch (e) {
		Logger.warn("eval did not yield any result", e);
	}

	return result;
}

async function tryExecuteJs(
	query: string,
	file: PublishFile,
	dvApi: DataviewApi,
) {
	const div = createEl("div");
	const component = new Component();
	component.load();
	await dvApi.executeJs(query, div, component, file.getPath());
	let counter = 0;

	while (!div.querySelector("[data-tag-name]") && counter < 50) {
		await delay(5);
		counter++;
	}

	return div.innerHTML;
}

//delay async function
function delay(milliseconds: number) {
	return new Promise((resolve, _) => {
		setTimeout(resolve, milliseconds);
	});
}
