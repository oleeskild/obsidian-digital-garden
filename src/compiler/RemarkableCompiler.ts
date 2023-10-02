import { MetadataCache, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { PublishFile } from "../publishFile/PublishFile";
import Publisher from "../publisher/Publisher";
import { PathRewriteRule } from "../repositoryConnection/DigitalGardenSiteManager";
import { getRewriteRules } from "../utils/utils";
import { ExcalidrawCompiler } from "./ExcalidrawCompiler";
import {
	TCompilerStep,
	TCompiledFile,
	Assets,
	GardenPageCompiler,
} from "./GardenPageCompiler";
import { remark } from "remark";
import {
	BuildVisitor,
	Test,
	UnistNode,
	VisitorResult,
	visit,
} from "unist-util-visit";
import { DataviewApi, getAPI } from "obsidian-dataview";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

export class RemarkableParser {
	private readonly vault: Vault;
	private readonly settings: DigitalGardenSettings;
	private excalidrawCompiler: ExcalidrawCompiler;
	private metadataCache: MetadataCache;
	private readonly getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"];

	private rewriteRules: PathRewriteRule[];

	constructor(
		vault: Vault,
		settings: DigitalGardenSettings,
		metadataCache: MetadataCache,
		getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"],
	) {
		this.vault = vault;
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.getFilesMarkedForPublishing = getFilesMarkedForPublishing;
		this.excalidrawCompiler = new ExcalidrawCompiler(vault);
		this.rewriteRules = getRewriteRules(this.settings.pathRewriteRules);
	}

	convertDataview = (file: PublishFile) => () => async (tree) => {
		const asyncOperations: Promise<any>[] = [];

		visit(tree, "code", (node) => {
			if (node.lang === "dataview") {
				const query = node.value;
				const api = getAPI();

				if (!api) return;

				const op = api
					.tryQueryMarkdown(query, file.getPath())
					.then((markdown: string) => {
						node.value = markdown;
						node.type = "text";
					});

				asyncOperations.push(op);
			}
		});
		await Promise.all(asyncOperations);
	};

	async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
		const assets: Assets = { images: [] };

		const vaultFileText = await file.cachedRead();

		const NormalParser = new GardenPageCompiler(
			this.vault,
			this.settings,
			this.metadataCache,
			this.getFilesMarkedForPublishing,
		);

		const frontmatter = file.getCompiledFrontmatter();

		const COMPILE_STEPS: TCompilerStep[] = [
			NormalParser.removeFrontmatter,
			NormalParser.convertCustomFilters,
			NormalParser.createBlockIDs,
			NormalParser.createTranscludedText(0),
			NormalParser.convertLinksToFullPath,
			NormalParser.removeObsidianComments,
			NormalParser.createSvgEmbeds,
		];

		const compiledText = await NormalParser.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const parsed = await remark()
			.use(this.convertDataview(file))
			.process(compiledText);

		console.log(parsed);

		const result = `${frontmatter}\n${String(parsed.value)}`;

		return [result, { images: [] }];
	}

	extractImageLinks = (file) => [];
}
