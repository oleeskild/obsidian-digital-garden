import {
	MetadataCache,
	Notice,
	TFile,
	Vault,
	arrayBufferToBase64,
	getLinkpath,
} from "obsidian";
import QuartzSyncerSettings from "../models/settings";
import { PathRewriteRule } from "../repositoryConnection/QuartzSyncerSiteManager";
import Publisher from "../publisher/Publisher";
import {
	fixSvgForXmlSerializer,
	generateUrlPath,
	getSyncerPathForNote,
	getRewriteRules,
	sanitizePermalink,
} from "../utils/utils";
import { ExcalidrawCompiler } from "./ExcalidrawCompiler";
import slugify from "@sindresorhus/slugify";
import { fixMarkdownHeaderSyntax } from "../utils/markdown";
import {
	CODEBLOCK_REGEX,
	CODE_FENCE_REGEX,
	EXCALIDRAW_REGEX,
	FRONTMATTER_REGEX,
	BLOCKREF_REGEX,
	TRANSCLUDED_SVG_REGEX,
	DATAVIEW_LINK_TARGET_BLANK_REGEX,
	TRANSCLUDED_FILE_REGEX,
	FILE_REGEX,
} from "../utils/regexes";
import Logger from "js-logger";
import { DataviewCompiler } from "./DataviewCompiler";
import { PublishFile } from "../publishFile/PublishFile";

export interface Asset {
	path: string;
	content: string;
	// not set yet
	remoteHash?: string;
}

export interface Assets {
	blobs: Array<Asset>;
}

export type TCompiledFile = [string, Assets];

export type TCompilerStep = (
	publishFile: PublishFile,
) =>
	| ((partiallyCompiledContent: string) => Promise<string>)
	| ((partiallyCompiledContent: string) => string);

export class SyncerPageCompiler {
	private readonly vault: Vault;
	private readonly settings: QuartzSyncerSettings;
	private excalidrawCompiler: ExcalidrawCompiler;
	private metadataCache: MetadataCache;
	private readonly getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"];
	private rewriteRule: PathRewriteRule;

	constructor(
		vault: Vault,
		settings: QuartzSyncerSettings,
		metadataCache: MetadataCache,
		getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"],
	) {
		this.vault = vault;
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.getFilesMarkedForPublishing = getFilesMarkedForPublishing;
		this.excalidrawCompiler = new ExcalidrawCompiler(vault);
		this.rewriteRule = getRewriteRules(this.settings.vaultPath);
	}

	runCompilerSteps =
		(file: PublishFile, compilerSteps: TCompilerStep[]) =>
		async (text: string): Promise<string> => {
			return await compilerSteps.reduce(
				async (previousStep, compilerStep) => {
					const previousStepText = await previousStep;

					return compilerStep(file)(previousStepText);
				},
				Promise.resolve(text),
			);
		};

	async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
		const assets: Assets = { blobs: [] };

		const vaultFileText = await file.cachedRead();

		if (this.settings.useExcalidraw) {
			if (file.file.name.endsWith(".excalidraw.md")) {
				return [
					await this.excalidrawCompiler.compileMarkdown({
						includeExcaliDrawJs: true,
					})(file)(vaultFileText),
					assets,
				];
			}
		}

		// ORDER MATTERS!
		const COMPILE_STEPS: TCompilerStep[] = [
			this.convertFrontMatter,
			this.createTranscludedText(0),
			this.convertDataViews,
			this.convertLinksToFullPath,
			this.removeObsidianComments,
			this.createSvgEmbeds,
			this.linkTargeting,
			this.applyVaultPath,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const [text, blobs] = await this.convertFileLinks(file)(compiledText);

		return [text, { blobs }];
	}

	applyVaultPath: TCompilerStep = () => (text) => {
		const wikilinkRegex = new RegExp(
			"\\[\\[" + this.settings.vaultPath + "(.*?)\\]\\]",
			"g",
		);

		const markdownLinkRegex = new RegExp(
			"\\[(.*?)\\]\\(" + this.settings.vaultPath + "(.*?)\\)",
			"g",
		);

		if (this.settings.vaultPath !== "/" && this.settings.vaultPath !== "") {
			try {
				text = text.replace(wikilinkRegex, "[[$1]]");
				text = text.replace(markdownLinkRegex, "[$1]($2)");
			} catch (e) {
				Logger.error(
					`Error while applying vault path to text: ${text}. Error: ${e}`,
				);

				// TODO: validate in settings
				new Notice(
					`Your custom filters contains an invalid regex. Skipping it.`,
				);
			}
		}

		return text;
	};

	removeObsidianComments: TCompilerStep = () => (text) => {
		const obsidianCommentsRegex = /%%.+?%%/gms;
		const obsidianCommentsMatches = text.match(obsidianCommentsRegex);

		const codeBlocks = text.match(CODEBLOCK_REGEX) || [];
		const codeFences = text.match(CODE_FENCE_REGEX) || [];
		const excalidraw = text.match(EXCALIDRAW_REGEX) || [];
		const matchesToSkip = [...codeBlocks, ...codeFences, ...excalidraw];

		if (!obsidianCommentsMatches) return text;

		for (const commentMatch of obsidianCommentsMatches) {
			//If comment is in a code block, code fence, or excalidrawing, leave it in
			if (matchesToSkip.findIndex((x) => x.contains(commentMatch)) > -1) {
				continue;
			}

			text = text.replace(commentMatch, "");
		}

		return text;
	};

	convertFrontMatter: TCompilerStep = (file) => (text) => {
		const compiledFrontmatter = file.getCompiledFrontmatter();

		return text.replace(FRONTMATTER_REGEX, () => compiledFrontmatter);
	};

	convertDataViews: TCompilerStep = (file) => async (text) => {
		if (!this.settings.useDataview) {
			return text;
		}

		const dataviewCompiler = new DataviewCompiler();

		return await dataviewCompiler.compile(file)(text);
	};

	linkTargeting: TCompilerStep = () => (text) => {
		return text.replace(DATAVIEW_LINK_TARGET_BLANK_REGEX, "");
	};

	private stripAwayCodeFencesAndFrontmatter: TCompilerStep = () => (text) => {
		let textToBeProcessed = text;
		textToBeProcessed = textToBeProcessed.replace(EXCALIDRAW_REGEX, "");
		textToBeProcessed = textToBeProcessed.replace(CODEBLOCK_REGEX, "");
		textToBeProcessed = textToBeProcessed.replace(CODE_FENCE_REGEX, "");

		textToBeProcessed = textToBeProcessed.replace(FRONTMATTER_REGEX, "");

		return textToBeProcessed;
	};

	convertLinksToFullPath: TCompilerStep = (file) => async (text) => {
		let convertedText = text;

		const textToBeProcessed =
			await this.stripAwayCodeFencesAndFrontmatter(file)(text);

		const linkedFileRegex = /\[\[(.+?)\]\]/g;
		const linkedFileMatches = textToBeProcessed.match(linkedFileRegex);

		if (linkedFileMatches) {
			for (const linkMatch of linkedFileMatches) {
				try {
					const textInsideBrackets = linkMatch.substring(
						linkMatch.indexOf("[") + 2,
						linkMatch.lastIndexOf("]") - 1,
					);

					let [linkedFileName, linkDisplayName] =
						textInsideBrackets.split("|");

					if (linkedFileName.endsWith("\\")) {
						linkedFileName = linkedFileName.substring(
							0,
							linkedFileName.length - 1,
						);
					}

					linkDisplayName = linkDisplayName || linkedFileName;
					let headerPath = "";

					// detect links to headers or blocks
					if (linkedFileName.includes("#")) {
						const headerSplit = linkedFileName.split("#");
						linkedFileName = headerSplit[0];

						//currently no support for linking to nested heading with multiple #s
						headerPath =
							headerSplit.length > 1 ? `#${headerSplit[1]}` : "";
					}
					const fullLinkedFilePath = getLinkpath(linkedFileName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						fullLinkedFilePath,
						file.getPath(),
					);

					if (!linkedFile) {
						convertedText = convertedText.replace(
							linkMatch,
							`[[${linkedFileName}${headerPath}\\|${linkDisplayName}]]`,
						);
						continue;
					}

					if (linkedFile.extension === "md") {
						const extensionlessPath = linkedFile.path.substring(
							0,
							linkedFile.path.lastIndexOf("."),
						);

						convertedText = convertedText.replace(
							linkMatch,
							`[[${extensionlessPath}${headerPath}\\|${linkDisplayName}]]`,
						);
					}
				} catch (e) {
					console.log(e);
					continue;
				}
			}
		}

		return convertedText;
	};

	createTranscludedText =
		(currentDepth: number): TCompilerStep =>
		(file) =>
		async (text) => {
			if (currentDepth >= 4) {
				return text;
			}

			if (!this.settings.applyEmbeds) {
				return text;
			}

			const { notes: publishedFiles } =
				await this.getFilesMarkedForPublishing();

			let transcludedText = text;

			const transcludedRegex = /!\[\[(.+?)\]\]/g;
			const transclusionMatches = text.match(transcludedRegex);
			let numberOfExcaliDraws = 0;

			for (const transclusionMatch of transclusionMatches ?? []) {
				try {
					const [transclusionFileNameInitial, _] = transclusionMatch
						.substring(
							transclusionMatch.indexOf("[") + 2,
							transclusionMatch.indexOf("]"),
						)
						.split("|");

					const transclusionFileName =
						transclusionFileNameInitial.endsWith("\\")
							? transclusionFileNameInitial.substring(
									0,
									transclusionFileNameInitial.length - 1,
							  )
							: transclusionFileNameInitial;

					const transclusionFilePath =
						getLinkpath(transclusionFileName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						transclusionFilePath,
						file.getPath(),
					);

					if (!linkedFile) {
						console.error(
							`can't find transcluded file ${transclusionFilePath}`,
						);
						continue;
					}

					const publishLinkedFile = new PublishFile({
						file: linkedFile,
						compiler: this,
						metadataCache: this.metadataCache,
						vault: this.vault,
						settings: this.settings,
					});

					if (linkedFile.name.endsWith(".excalidraw.md")) {
						numberOfExcaliDraws++;
						const isFirstDrawing = numberOfExcaliDraws === 1;

						const fileText = await publishLinkedFile.cachedRead();

						const excaliDrawCode =
							await this.excalidrawCompiler.compileMarkdown({
								includeExcaliDrawJs: isFirstDrawing,
								idAppendage: `${numberOfExcaliDraws}`,
								includeFrontMatter: false,
							})(publishLinkedFile)(fileText);

						transcludedText = transcludedText.replace(
							transclusionMatch,
							excaliDrawCode,
						);
					} else if (linkedFile.extension === "md") {
						let fileText = await publishLinkedFile.cachedRead();

						const metadata = publishLinkedFile.getMetadata();

						if (transclusionFileName.includes("#^")) {
							// Transclude Block
							const refBlock =
								transclusionFileName.split("#^")[1];

							const blockInFile =
								publishLinkedFile.getBlock(refBlock);

							if (blockInFile) {
								fileText = fileText
									.split("\n")
									.slice(
										blockInFile.position.start.line,
										blockInFile.position.end.line + 1,
									)
									.join("\n")
									.replace(`^${refBlock}`, "");
							}
						} else if (transclusionFileName.includes("#")) {
							// transcluding header only
							const refHeader =
								transclusionFileName.split("#")[1];

							// This is to mitigate the issue where the header matching doesn't work properly with headers with special characters (e.g. :)
							// Obsidian's autocomplete for transclusion omits such charcters which leads to full page transclusion instead of just the heading
							const headerSlug = slugify(refHeader, {
								separator: "-",
								lowercase: false,
							});

							const headerInFile = metadata?.headings?.find(
								(header) =>
									slugify(header.heading, {
										separator: "-",
										lowercase: false,
									}) === headerSlug,
							);

							if (headerInFile && metadata?.headings) {
								const headerPosition =
									metadata.headings.indexOf(headerInFile);

								// Embed should copy the content proparly under the given block
								const cutTo = metadata.headings
									.slice(headerPosition + 1)
									.find(
										(header) =>
											header.level <= headerInFile.level,
									);

								if (cutTo) {
									const cutToLine =
										cutTo?.position?.start?.line;

									fileText = fileText
										.split("\n")
										.slice(
											headerInFile.position.start.line,
											cutToLine,
										)
										.join("\n");
								} else {
									fileText = fileText
										.split("\n")
										.slice(headerInFile.position.start.line)
										.join("\n");
								}
							}
						}
						//Remove frontmatter from transclusion
						fileText = fileText.replace(FRONTMATTER_REGEX, "");

						// Apply custom filters to transclusion
						fileText =
							await this.applyVaultPath(publishLinkedFile)(
								fileText,
							);

						// Remove block reference
						fileText = fileText.replace(BLOCKREF_REGEX, "");

						const publishedFilesContainsLinkedFile =
							publishedFiles.find(
								(f) => f.getPath() == linkedFile.path,
							);

						if (publishedFilesContainsLinkedFile) {
							const permalink =
								metadata?.frontmatter &&
								metadata.frontmatter["permalink"];

							const quartzPathFull = permalink
								? sanitizePermalink(permalink)
								: sanitizePermalink(
										generateUrlPath(
											getSyncerPathForNote(
												linkedFile.path,
												this.rewriteRule,
											),
										),
								  );

							let quartzPath = quartzPathFull.endsWith("/")
								? quartzPathFull.slice(0, -1)
								: quartzPathFull;

							if (
								this.settings.vaultPath !== "/" &&
								this.settings.vaultPath !== ""
							) {
								quartzPath = quartzPath.replace(
									this.settings.vaultPath,
									"",
								);
							}
						}

						if (fileText.match(transcludedRegex)) {
							fileText = await this.createTranscludedText(
								currentDepth + 1,
							)(publishLinkedFile)(fileText);
						}

						//This should be recursive up to a certain depth
						transcludedText = transcludedText.replace(
							transclusionMatch,
							fileText,
						);
					}
				} catch (error) {
					console.error(error);
					continue;
				}
			}

			return transcludedText;
		};

	createSvgEmbeds: TCompilerStep = (file) => async (text) => {
		function setWidth(svgText: string, size: string): string {
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
			const svgElement = svgDoc.getElementsByTagName("svg")[0];
			svgElement.setAttribute("width", size);
			fixSvgForXmlSerializer(svgElement);
			const svgSerializer = new XMLSerializer();

			return svgSerializer.serializeToString(svgDoc);
		}

		const transcludedSvgs = text.match(TRANSCLUDED_SVG_REGEX);

		if (transcludedSvgs) {
			for (const svg of transcludedSvgs) {
				try {
					const [blobName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const blobPath = getLinkpath(blobName);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					let svgText = await this.vault.read(linkedFile);

					if (svgText && size) {
						svgText = setWidth(svgText, size);
					}

					if (svgText) {
						//Remove whitespace, as markdown-it will insert a <p> tag otherwise
						svgText = svgText.replace(/[\t\n\r]/g, "");
					}
					text = text.replace(svg, svgText);
				} catch {
					continue;
				}
			}
		}

		//!()[blob.svg]
		const linkedSvgRegex = /!\[(.*?)\]\((.*?)(\.(svg))\)/g;
		const linkedSvgMatches = text.match(linkedSvgRegex);

		if (linkedSvgMatches) {
			for (const svg of linkedSvgMatches) {
				try {
					const [_blobName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const pathStart = svg.lastIndexOf("(") + 1;
					const pathEnd = svg.lastIndexOf(")");
					const blobPath = svg.substring(pathStart, pathEnd);

					if (blobPath.startsWith("http")) {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					let svgText = await this.vault.read(linkedFile);

					if (svgText && size) {
						svgText = setWidth(svgText, size);
					}
					text = text.replace(svg, svgText);
				} catch {
					continue;
				}
			}
		}

		return text;
	};

	extractBlobLinks = async (file: PublishFile) => {
		const text = await file.cachedRead();
		const assets = [];

		//![[blob.png]]
		const transcludedBlobMatches = text.match(TRANSCLUDED_FILE_REGEX);

		if (transcludedBlobMatches) {
			for (let i = 0; i < transcludedBlobMatches.length; i++) {
				try {
					const blobMatch = transcludedBlobMatches[i];

					const [blobName, _] = blobMatch
						.substring(
							blobMatch.indexOf("[") + 2,
							blobMatch.indexOf("]"),
						)
						.split("|");

					let previous;
					let actualBlobName = blobName;

					do {
						previous = actualBlobName;

						actualBlobName = actualBlobName.replace(/\.\.\//g, "");
					} while (actualBlobName !== previous);

					const actualBlobPath = actualBlobName;

					const blobPath = getLinkpath(actualBlobPath);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						blobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					assets.push(linkedFile.path);
				} catch (e) {
					continue;
				}
			}
		}

		//![](blob.png)
		const blobMatches = text.match(FILE_REGEX);

		if (blobMatches) {
			for (let i = 0; i < blobMatches.length; i++) {
				try {
					const blobMatch = blobMatches[i];

					const pathStart = blobMatch.lastIndexOf("(") + 1;
					const pathEnd = blobMatch.lastIndexOf(")");
					let blobPath = blobMatch.substring(pathStart, pathEnd);

					if (blobPath.startsWith("http")) {
						continue;
					}

					let previous;

					do {
						previous = blobPath;
						blobPath = blobPath.replace(/\.\.\//g, "");
					} while (blobPath !== previous);

					const actualBlobPath = blobPath;

					const decodedBlobPath = decodeURI(actualBlobPath);

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						decodedBlobPath,
						file.getPath(),
					);

					if (!linkedFile) {
						continue;
					}

					assets.push(linkedFile.path);
				} catch {
					continue;
				}
			}
		}

		return assets;
	};

	convertFileLinks =
		(file: PublishFile) =>
		async (text: string): Promise<[string, Array<Asset>]> => {
			const filePath = file.getPath();
			const assets = [];

			let blobText = text;

			//![[blob.png]]
			const transcludedBlobMatches = text.match(TRANSCLUDED_FILE_REGEX);

			if (transcludedBlobMatches) {
				for (let i = 0; i < transcludedBlobMatches.length; i++) {
					try {
						const blobMatch = transcludedBlobMatches[i];

						//Alt 1: [blob.png|100]
						//Alt 2: [blob.png|meta1 meta2|100]
						//Alt 3: [blob.png|meta1 meta2]
						const [blobName, ...metaDataAndSize] = blobMatch
							.substring(
								blobMatch.indexOf("[") + 2,
								blobMatch.indexOf("]"),
							)
							.split("|");

						const lastValue =
							metaDataAndSize[metaDataAndSize.length - 1];

						const hasSeveralValues = metaDataAndSize.length > 0;

						const lastValueIsSize =
							hasSeveralValues && !isNaN(parseInt(lastValue));

						const lastValueIsMetaData =
							!lastValueIsSize && hasSeveralValues;

						const size = lastValueIsSize ? lastValue : null;

						let metaData = "";

						const metaDataIsMiddleValues =
							metaDataAndSize.length > 1;

						//Alt 2: [blob.png|meta1 meta2|100]
						if (metaDataIsMiddleValues) {
							metaData = metaDataAndSize
								.slice(0, metaDataAndSize.length - 1)
								.join(" ");
						}

						//Alt 2: [blob.png|meta1 meta2]
						if (lastValueIsMetaData) {
							metaData = `${lastValue}`;
						}

						const blobPath = getLinkpath(blobName);

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								blobPath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}
						const blob = await this.vault.readBinary(linkedFile);
						const blobBase64 = arrayBufferToBase64(blob);

						let relativeEmbedPrefix = "";

						const embedDepthVaultPath =
							this.settings.vaultPath !== "/" &&
							this.settings.vaultPath !== ""
								? this.settings.vaultPath.split("/").length - 1
								: 0;

						const embedPrefixVaultPath =
							"../".repeat(embedDepthVaultPath) +
							this.settings.vaultPath;

						for (
							let i = 0;
							i < filePath.split("/").length - 1;
							i++
						) {
							relativeEmbedPrefix += "../";
						}

						const cmsImgPath =
							embedDepthVaultPath === 0
								? `${relativeEmbedPrefix}${linkedFile.path}`
								: `${relativeEmbedPrefix}${linkedFile.path}`.replace(
										embedPrefixVaultPath,
										"",
								  );
						let name = "";

						if (metaData && size) {
							name = `|${metaData}|${size}`;
						} else if (size) {
							name = `|${size}`;
						} else if (metaData && metaData !== "") {
							name = `|${metaData}`;
						} else {
							name = "";
						}

						const blobMarkdown = `![[${cmsImgPath}${name}]]`;

						assets.push({ path: cmsImgPath, content: blobBase64 });

						blobText = blobText.replace(blobMatch, blobMarkdown);
					} catch (e) {
						continue;
					}
				}
			}

			//![](blob.png)
			const blobMatches = text.match(FILE_REGEX);

			if (blobMatches) {
				for (let i = 0; i < blobMatches.length; i++) {
					try {
						const blobMatch = blobMatches[i];

						const nameStart = blobMatch.indexOf("[") + 1;
						const nameEnd = blobMatch.indexOf("]");

						const blobName = blobMatch.substring(
							nameStart,
							nameEnd,
						);

						const pathStart = blobMatch.lastIndexOf("(") + 1;
						const pathEnd = blobMatch.lastIndexOf(")");

						const blobPath = blobMatch.substring(
							pathStart,
							pathEnd,
						);

						if (blobPath.startsWith("http")) {
							continue;
						}

						const decodedBlobPath = decodeURI(blobPath);

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								decodedBlobPath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}
						const blob = await this.vault.readBinary(linkedFile);
						const blobBase64 = arrayBufferToBase64(blob);

						let relativeEmbedPrefix = "";

						for (
							let i = 0;
							i < filePath.split("/").length - 1;
							i++
						) {
							relativeEmbedPrefix += "../";
						}

						const cmsImgPath = `${relativeEmbedPrefix}${linkedFile.path}`;
						const blobMarkdown = `![${blobName}](${cmsImgPath})`;
						assets.push({ path: cmsImgPath, content: blobBase64 });

						blobText = blobText.replace(blobMatch, blobMarkdown);
					} catch {
						continue;
					}
				}
			}

			return [blobText, assets];
		};

	generateTransclusionHeader(
		headerName: string | undefined,
		transcludedFile: TFile,
	) {
		if (!headerName) {
			return headerName;
		}

		const titleVariable = "{{title}}";

		if (headerName.includes(titleVariable)) {
			headerName = headerName.replace(
				titleVariable,
				transcludedFile.basename,
			);
		}

		return fixMarkdownHeaderSyntax(headerName);
	}
}
