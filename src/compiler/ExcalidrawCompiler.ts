import { Vault } from "obsidian";
import { excaliDrawBundle, excalidraw } from "../ui/suggest/constants";
import LZString from "lz-string";
import { TCompilerStep } from "./GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";

interface IExcalidrawCompilerProps {
	/**Includes excalidraw script bundle in compilation result */
	includeExcaliDrawJs: boolean;
	/** Is appended to the drawing id */
	idAppendage?: string;
	/** Includes frontmatter in compilation result */
	includeFrontMatter?: boolean;
}

export class ExcalidrawCompiler {
	private readonly vault: Vault;

	constructor(vault: Vault) {
		this.vault = vault;
	}
	compileMarkdown =
		({
			includeExcaliDrawJs,
			idAppendage = "",
			includeFrontMatter = true,
		}: IExcalidrawCompilerProps): TCompilerStep =>
		(file: PublishFile) =>
		(fileText: string) => {
			if (!file.file.name.endsWith(".excalidraw.md")) {
				throw new Error("File is not an excalidraw file");
			}

			const isCompressed = fileText.includes("```compressed-json");
			const startString = isCompressed ? "```compressed-json" : "```json";

			const start = fileText.indexOf(startString) + startString.length;
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
