import { TFile, Vault } from "obsidian";
import { excaliDrawBundle, excalidraw } from "../ui/suggest/constants";
import LZString from "lz-string";

export class ExcalidrawCompiler {
	private readonly vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}
	async compileMarkdown(
		{
			file,
			processedFrontmatter,
			fileText,
		}: {
			file: TFile;
			processedFrontmatter: string;
			fileText: string;
		},
		includeExcaliDrawJs: boolean,
		idAppendage = "",
		includeFrontMatter = true,
	): Promise<string> {
		if (!file.name.endsWith(".excalidraw.md")) return "";

		const isCompressed = fileText.includes("```compressed-json");

		const start =
			fileText.indexOf(isCompressed ? "```compressed-json" : "```json") +
			(isCompressed ? "```compressed-json" : "```json").length;
		const end = fileText.lastIndexOf("```");

		const excaliDrawJson = JSON.parse(
			isCompressed
				? LZString.decompressFromBase64(
						fileText.slice(start, end).replace(/[\n\r]/g, ""),
				  )
				: fileText.slice(start, end),
		);

		const drawingId =
			file.name.split(" ").join("_").replace(".", "") + idAppendage;
		let excaliDrawCode = "";

		if (includeExcaliDrawJs) {
			excaliDrawCode += excaliDrawBundle;
		}

		excaliDrawCode += excalidraw(JSON.stringify(excaliDrawJson), drawingId);

		return `${
			includeFrontMatter ? processedFrontmatter : ""
		}${excaliDrawCode}`;
	}
}
