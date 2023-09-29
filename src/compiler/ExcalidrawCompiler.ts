import { Vault } from "obsidian";
import { excaliDrawBundle, excalidraw } from "../ui/suggest/constants";
import LZString from "lz-string";
import { TCompilerStep } from "./GardenPageCompiler";
import { PublishFile } from "../publisher/PublishFile";

export class ExcalidrawCompiler {
	private readonly vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}
	compileMarkdown =
		(
			includeExcaliDrawJs: boolean,
			idAppendage = "",
			includeFrontMatter = true,
		): TCompilerStep =>
		(file: PublishFile) =>
		(fileText: string) => {
			if (!file.file.name.endsWith(".excalidraw.md")) {
				throw new Error("File is not an excalidraw file");
			}

			const isCompressed = fileText.includes("```compressed-json");

			const start =
				fileText.indexOf(
					isCompressed ? "```compressed-json" : "```json",
				) + (isCompressed ? "```compressed-json" : "```json").length;
			const end = fileText.lastIndexOf("```");

			const excaliDrawJson = JSON.parse(
				isCompressed
					? LZString.decompressFromBase64(
							fileText.slice(start, end).replace(/[\n\r]/g, ""),
					  )
					: fileText.slice(start, end),
			);

			const drawingId =
				file.file.name.split(" ").join("_").replace(".", "") +
				idAppendage;

			let excaliDrawCode = "";

			if (includeExcaliDrawJs) {
				excaliDrawCode += excaliDrawBundle;
			}

			excaliDrawCode += excalidraw(
				JSON.stringify(excaliDrawJson),
				drawingId,
			);

			return `${
				includeFrontMatter ? file.getCompiledFrontmatter() : ""
			}${excaliDrawCode}`;
		};
}
