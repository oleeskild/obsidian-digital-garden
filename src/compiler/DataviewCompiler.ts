import { Component, Notice } from "obsidian";
import { TCompilerStep } from "./GardenPageCompiler";
import { escapeRegExp } from "../utils/utils";
import { getAPI } from "obsidian-dataview";

export class DataviewCompiler {
	constructor() {}

	compile: TCompilerStep = (file) => async (text) => {
		let replacedText = text;
		const dataViewRegex = /```dataview\s(.+?)```/gms;
		const dvApi = getAPI();

		if (!dvApi) return replacedText;
		const matches = text.matchAll(dataViewRegex);

		const dataviewJsPrefix = dvApi.settings.dataviewJsKeyword;

		const dataViewJsRegex = new RegExp(
			"```" + escapeRegExp(dataviewJsPrefix) + "\\s(.+?)```",
			"gsm",
		);
		const dataviewJsMatches = text.matchAll(dataViewJsRegex);

		const inlineQueryPrefix = dvApi.settings.inlineQueryPrefix;

		const inlineDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineQueryPrefix) + "(.+?)`",
			"gsm",
		);
		const inlineMatches = text.matchAll(inlineDataViewRegex);

		const inlineJsQueryPrefix = dvApi.settings.inlineJsQueryPrefix;

		const inlineJsDataViewRegex = new RegExp(
			"`" + escapeRegExp(inlineJsQueryPrefix) + "(.+?)`",
			"gsm",
		);
		const inlineJsMatches = text.matchAll(inlineJsDataViewRegex);

		if (
			!matches &&
			!inlineMatches &&
			!dataviewJsMatches &&
			!inlineJsMatches
		) {
			return text;
		}

		//Code block queries
		for (const queryBlock of matches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const { isInsideCallout, finalQuery } =
					this.sanitizeQuery(query);

				let markdown = await dvApi.tryQueryMarkdown(
					finalQuery,
					file.getPath(),
				);

				if (isInsideCallout) {
					markdown = this.surroundWithCalloutBlock(markdown);
				}

				replacedText = replacedText.replace(
					block,
					`${markdown}\n{ .block-language-dataview}`,
				);
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render dataview query. Please update the dataview plugin to the latest version.",
				);

				return queryBlock[0];
			}
		}

		for (const queryBlock of dataviewJsMatches) {
			try {
				const block = queryBlock[0];
				const query = queryBlock[1];

				const div = createEl("div");
				const component = new Component();
				await dvApi.executeJs(query, div, component, file.getPath());
				component.load();

				replacedText = replacedText.replace(block, div.innerHTML);
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render dataviewjs query. Please update the dataview plugin to the latest version.",
				);

				return queryBlock[0];
			}
		}

		//Inline queries
		for (const inlineQuery of inlineMatches) {
			try {
				const code = inlineQuery[0];
				const query = inlineQuery[1];

				const dataviewResult = dvApi.tryEvaluate(query.trim(), {
					// @ts-expect-error errors are caught
					this: dvApi.page(file.getPath()),
				});

				if (dataviewResult) {
					replacedText = replacedText.replace(
						code,
						// @ts-expect-error errors are caught
						dataviewResult.toString(),
					);
				}
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render inline dataview query. Please update the dataview plugin to the latest version.",
				);

				return inlineQuery[0];
			}
		}

		for (const inlineJsQuery of inlineJsMatches) {
			try {
				const code = inlineJsQuery[0];
				const query = inlineJsQuery[1];

				const div = createEl("div");
				const component = new Component();
				await dvApi.executeJs(query, div, component, file.getPath());
				component.load();

				replacedText = replacedText.replace(code, div.innerHTML);
			} catch (e) {
				console.log(e);

				new Notice(
					"Unable to render inline dataviewjs query. Please update the dataview plugin to the latest version.",
				);

				return inlineJsQuery[0];
			}
		}

		return replacedText;
	};

	/**
	 * Splits input in lines.
	 * Prepends the callout/quote sign to each line,
	 * returns all the lines as a single string
	 *
	 */
	surroundWithCalloutBlock(input: string): string {
		const tmp = input.split("\n");

		return " " + tmp.join("\n> ");
	}

	/**
	 * Checks if a query is inside a callout block.
	 * Removes the callout symbols and re-join sanitized parts.
	 * Also returns the boolean that indicates if the query was inside a callout.
	 * @param query
	 * @returns
	 */
	sanitizeQuery(query: string): {
		isInsideCallout: boolean;
		finalQuery: string;
	} {
		let isInsideCallout = false;
		const parts = query.split("\n");
		const sanitized = [];

		for (const part of parts) {
			if (part.startsWith(">")) {
				isInsideCallout = true;
				sanitized.push(part.substring(1).trim());
			} else {
				sanitized.push(part);
			}
		}
		let finalQuery = query;

		if (isInsideCallout) {
			finalQuery = sanitized.join("\n");
		}

		return { isInsideCallout, finalQuery };
	}
}
