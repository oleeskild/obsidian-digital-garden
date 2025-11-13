import {
	MetadataCache,
	Notice,
	TFile,
	Vault,
	arrayBufferToBase64,
	getLinkpath,
} from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { PathRewriteRule } from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "../publisher/Publisher";
import {
	fixSvgForXmlSerializer,
	generateUrlPath,
	getGardenPathForNote,
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
	PDF_REGEX,
	TRANSCLUDED_PDF_REGEX,
} from "../utils/regexes";
import Logger from "js-logger";
import { DataviewCompiler } from "./DataviewCompiler";
import { PublishFile } from "../publishFile/PublishFile";
import { replaceBlockIDs } from "./replaceBlockIDs";

export interface Asset {
	path: string;
	content: string;
	// not set yet
	remoteHash?: string;
}
export interface Assets {
	images: Array<Asset>;
}

export type TCompiledFile = [string, Assets];

export type TCompilerStep = (
	publishFile: PublishFile,
) =>
	| ((partiallyCompiledContent: string) => Promise<string>)
	| ((partiallyCompiledContent: string) => string);

export class GardenPageCompiler {
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
		const assets: Assets = { images: [] };

		const vaultFileText = await file.cachedRead();

		if (file.file.name.endsWith(".excalidraw.md")) {
			return [
				await this.excalidrawCompiler.compileMarkdown({
					includeExcaliDrawJs: true,
				})(file)(vaultFileText),
				assets,
			];
		}

		// ORDER MATTERS!
		const COMPILE_STEPS: TCompilerStep[] = [
			this.convertFrontMatter,
			this.convertCustomFilters,
			this.createBlockIDs,
			this.createTranscludedText(0),
			this.convertDataViews,
			this.convertLinksToFullPath,
			this.removeObsidianComments,
			this.createSvgEmbeds,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const [text, images] = await this.convertImageLinks(file)(compiledText);

		return [text, { images }];
	}

	convertCustomFilters: TCompilerStep = () => (text) => {
		for (const filter of this.settings.customFilters) {
			try {
				text = text.replace(
					RegExp(filter.pattern, filter.flags),
					filter.replace,
				);
			} catch (e) {
				Logger.error(
					`Invalid regex: ${filter.pattern} ${filter.flags}`,
				);

				// TODO: validate in settings
				new Notice(
					`Your custom filters contains an invalid regex: ${filter.pattern}. Skipping it.`,
				);
			}
		}

		return text;
	};

	createBlockIDs: TCompilerStep = () => (text: string) => {
		return replaceBlockIDs(text);
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
		const dataviewCompiler = new DataviewCompiler();

		return await dataviewCompiler.compile(file)(text);
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

					if (fullLinkedFilePath === "") {
						continue;
					}

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

			const { notes: publishedFiles } =
				await this.getFilesMarkedForPublishing();

			let transcludedText = text;

			const transcludedRegex = /!\[\[(.+?)\]\]/g;
			const transclusionMatches = text.match(transcludedRegex);
			let numberOfExcaliDraws = 0;

			for (const transclusionMatch of transclusionMatches ?? []) {
				try {
					const [transclusionFileName, headerName] = transclusionMatch
						.substring(
							transclusionMatch.indexOf("[") + 2,
							transclusionMatch.indexOf("]"),
						)
						.split("|");

					const transclusionFilePath =
						getLinkpath(transclusionFileName);

					if (transclusionFilePath === "") {
						continue;
					}

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
					let sectionID = "";

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

							sectionID = `#${slugify(refBlock)}`;

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
							const headerSlug = slugify(refHeader);

							const headerInFile = metadata?.headings?.find(
								(header) =>
									slugify(header.heading) === headerSlug,
							);

							sectionID = `#${slugify(refHeader)}`;

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
							await this.convertCustomFilters(publishLinkedFile)(
								fileText,
							);

						// Remove block reference
						fileText = fileText.replace(BLOCKREF_REGEX, "");

						const header = this.generateTransclusionHeader(
							headerName,
							linkedFile,
						);

						const headerSection = header
							? `<div class="markdown-embed-title">\n\n${header}\n\n</div>\n`
							: "";
						let embedded_link = "";

						const publishedFilesContainsLinkedFile =
							publishedFiles.find(
								(f) => f.getPath() == linkedFile.path,
							);

						if (publishedFilesContainsLinkedFile) {
							const permalink =
								metadata?.frontmatter &&
								metadata.frontmatter["dg-permalink"];

							const gardenPath = permalink
								? sanitizePermalink(permalink)
								: `/${generateUrlPath(
										getGardenPathForNote(
											linkedFile.path,
											this.rewriteRules,
										),
										this.settings.slugifyEnabled,
								  )}`;
							embedded_link = `<a class="markdown-embed-link" href="${gardenPath}${sectionID}" aria-label="Open link"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></a>`;
						}

						fileText =
							`\n<div class="transclusion internal-embed is-loaded">${embedded_link}<div class="markdown-embed">\n\n${headerSection}\n\n` +
							fileText +
							"\n\n</div></div>\n";

						if (fileText.match(transcludedRegex)) {
							fileText = await this.createTranscludedText(
								currentDepth + 1,
							)(publishLinkedFile)(fileText);
						}

						// compile dataview in transcluded text
						const withDvCompiledText = await this.runCompilerSteps(
							publishLinkedFile,
							[this.convertDataViews],
						)(fileText);
						fileText = withDvCompiledText;

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
					const [imageName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const imagePath = getLinkpath(imageName);

					if (imagePath === "") {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						imagePath,
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

		//!()[image.svg]
		const linkedSvgRegex = /!\[(.*?)\]\((.*?)(\.(svg))\)/g;
		const linkedSvgMatches = text.match(linkedSvgRegex);

		if (linkedSvgMatches) {
			for (const svg of linkedSvgMatches) {
				try {
					const [_imageName, size] = svg
						.substring(svg.indexOf("[") + 2, svg.indexOf("]"))
						.split("|");
					const pathStart = svg.lastIndexOf("(") + 1;
					const pathEnd = svg.lastIndexOf(")");
					const imagePath = svg.substring(pathStart, pathEnd);

					if (imagePath.startsWith("http")) {
						continue;
					}

					if (imagePath === "") {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						imagePath,
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
	extractImageLinks = async (file: PublishFile) => {
		const text = await file.cachedRead();
		const assets = [];

		//![[image.png]]
		const transcludedImageRegex =
			/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\]\]/g;
		const transcludedImageMatches = text.match(transcludedImageRegex);

		if (transcludedImageMatches) {
			for (let i = 0; i < transcludedImageMatches.length; i++) {
				try {
					const imageMatch = transcludedImageMatches[i];

					const [imageName, _] = imageMatch
						.substring(
							imageMatch.indexOf("[") + 2,
							imageMatch.indexOf("]"),
						)
						.split("|");
					const imagePath = getLinkpath(imageName);

					if (imagePath === "") {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						imagePath,
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

		//![](image.png)
		const imageRegex = /!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif|webp))\)/g;
		const imageMatches = text.match(imageRegex);

		if (imageMatches) {
			for (let i = 0; i < imageMatches.length; i++) {
				try {
					const imageMatch = imageMatches[i];

					const pathStart = imageMatch.lastIndexOf("(") + 1;
					const pathEnd = imageMatch.lastIndexOf(")");
					const imagePath = imageMatch.substring(pathStart, pathEnd);

					if (imagePath.startsWith("http")) {
						continue;
					}

					const decodedImagePath = decodeURI(imagePath);

					if (decodedImagePath === "") {
						continue;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						decodedImagePath,
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

	convertImageLinks =
		(file: PublishFile) =>
		async (text: string): Promise<[string, Array<Asset>]> => {
			const filePath = file.getPath();
			const assets = [];

			let imageText = text;

			//![[image.png]]
			const transcludedImageRegex =
				/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp))\]\]/g;
			const transcludedImageMatches = text.match(transcludedImageRegex);

			if (transcludedImageMatches) {
				for (let i = 0; i < transcludedImageMatches.length; i++) {
					try {
						const imageMatch = transcludedImageMatches[i];

						//Alt 1: [image.png|100]
						//Alt 2: [image.png|meta1 meta2|100]
						//Alt 3: [image.png|meta1 meta2]
						const [imageName, ...metaDataAndSize] = imageMatch
							.substring(
								imageMatch.indexOf("[") + 2,
								imageMatch.indexOf("]"),
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

						//Alt 2: [image.png|meta1 meta2|100]
						if (metaDataIsMiddleValues) {
							metaData = metaDataAndSize
								.slice(0, metaDataAndSize.length - 1)
								.join(" ");
						}

						//Alt 2: [image.png|meta1 meta2]
						if (lastValueIsMetaData) {
							metaData = `${lastValue}`;
						}

						const imagePath = getLinkpath(imageName);

						if (imagePath === "") {
							continue;
						}

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								imagePath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}
						const image = await this.vault.readBinary(linkedFile);
						const imageBase64 = arrayBufferToBase64(image);

						const cmsImgPath = `/img/user/${linkedFile.path}`;
						let name = "";

						if (metaData && size) {
							name = `${imageName}|${metaData}|${size}`;
						} else if (size) {
							name = `${imageName}|${size}`;
						} else if (metaData && metaData !== "") {
							name = `${imageName}|${metaData}`;
						} else {
							name = imageName;
						}

						const imageMarkdown = `![${name}](${encodeURI(
							cmsImgPath,
						)})`;

						assets.push({ path: cmsImgPath, content: imageBase64 });

						imageText = imageText.replace(
							imageMatch,
							imageMarkdown,
						);
					} catch (e) {
						continue;
					}
				}
			}

			//![](image.png)
			const imageRegex =
				/!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif|webp))\)/g;
			const imageMatches = text.match(imageRegex);

			if (imageMatches) {
				for (let i = 0; i < imageMatches.length; i++) {
					try {
						const imageMatch = imageMatches[i];
						const nameStart = imageMatch.indexOf("[") + 1;
						const nameEnd = imageMatch.indexOf("]");

						const imageName = imageMatch.substring(
							nameStart,
							nameEnd,
						);
						const pathStart = imageMatch.lastIndexOf("(") + 1;
						const pathEnd = imageMatch.lastIndexOf(")");

						const imagePath = imageMatch.substring(
							pathStart,
							pathEnd,
						);

						if (imagePath.startsWith("http")) {
							continue;
						}

						const decodedImagePath = decodeURI(imagePath);

						if (decodedImagePath === "") {
							continue;
						}

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								decodedImagePath,
								filePath,
							);

						if (!linkedFile) {
							continue;
						}
						const image = await this.vault.readBinary(linkedFile);
						const imageBase64 = arrayBufferToBase64(image);
						const cmsImgPath = `/img/user/${linkedFile.path}`;

						const imageMarkdown = `![${imageName}](${encodeURI(
							cmsImgPath,
						)})`;
						assets.push({ path: cmsImgPath, content: imageBase64 });

						imageText = imageText.replace(
							imageMatch,
							imageMarkdown,
						);
					} catch (e) {
						Logger.warn("Error processing image link:", e);
						continue;
					}
				}
			}

			// PDF LINKS
			// ![[mypdf.pdf]]
			const transcludedPdfRegex = TRANSCLUDED_PDF_REGEX;
			const transcludedPdfMatches = text.match(transcludedPdfRegex);
			console.log(`[PDF DEBUG] Processing note: ${filePath}`);

			console.log(
				`[PDF DEBUG] Transcluded PDF Regex: ${transcludedPdfRegex}`,
			);

			console.log(
				`[PDF DEBUG] Found transcluded PDF matches:`,
				transcludedPdfMatches,
			);

			if (transcludedPdfMatches) {
				for (let i = 0; i < transcludedPdfMatches.length; i++) {
					const pdfMatch = transcludedPdfMatches[i];

					console.log(
						`[PDF DEBUG] Transcluded Match ${i}: ${pdfMatch}`,
					);

					try {
						const [pdfNameFromFile, ...metadataParts] = pdfMatch
							.substring(
								pdfMatch.indexOf("[") + 2,
								pdfMatch.indexOf("]"),
							)
							.split("|");

						const altText =
							metadataParts.join("|") || pdfNameFromFile;

						console.log(
							`[PDF DEBUG] Transcluded: pdfNameFromFile='${pdfNameFromFile}', altText='${altText}'`,
						);

						const pdfPath = getLinkpath(pdfNameFromFile);

						console.log(
							`[PDF DEBUG] Transcluded: getLinkpath result='${pdfPath}'`,
						);

						if (pdfPath === "") {
							console.log(
								`[PDF DEBUG] Transcluded: pdfPath is empty. Fallback to wikilink.`,
							);

							imageText = imageText.replace(
								pdfMatch,
								`[[${pdfNameFromFile}${
									metadataParts.length > 0
										? "|" + metadataParts.join("|")
										: ""
								}]]`,
							);
							continue;
						}

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								pdfPath,
								filePath, // context path for resolving the link
							) as TFile;

						console.log(
							`[PDF DEBUG] Transcluded: linkedFile for '${pdfPath}' (context: '${filePath}'):`,
							linkedFile
								? {
										name: linkedFile.name,
										path: linkedFile.path,
										extension: linkedFile.extension,
										size: linkedFile.stat.size,
								  }
								: null,
						);

						if (!linkedFile || linkedFile.extension !== "pdf") {
							console.log(
								`[PDF DEBUG] Transcluded: linkedFile not found or not a PDF. Fallback to wikilink. Is linkedFile valid? ${!!linkedFile}. Extension: ${linkedFile?.extension}`,
							);

							const fallbackMarkdown = `[[${pdfNameFromFile}${
								metadataParts.length > 0
									? "|" + metadataParts.join("|")
									: ""
							}]]`;

							imageText = imageText.replace(
								pdfMatch,
								fallbackMarkdown,
							);
							continue;
						}

						if (linkedFile.stat.size > 20 * 1024 * 1024) {
							// 20MB
							console.log(
								`[PDF DEBUG] Transcluded: PDF '${linkedFile.name}' too large (${linkedFile.stat.size} bytes). Fallback to wikilink.`,
							);

							new Notice(
								`PDF ${linkedFile.name} is larger than 20MB and will not be published as an embed. A link will be used.`,
							);

							const fallbackWikilink = `[[${pdfNameFromFile}\\|PDF too large to publish${
								metadataParts.length > 0
									? "|" + metadataParts.join("|")
									: ""
							}]]`;

							imageText = imageText.replace(
								pdfMatch,
								fallbackWikilink,
							);
							continue;
						}

						console.log(
							`[PDF DEBUG] Transcluded: All checks passed for '${linkedFile.name}'. Proceeding to embed with iframe.`,
						);

						const pdfBinary =
							await this.vault.readBinary(linkedFile);
						const pdfBase64 = arrayBufferToBase64(pdfBinary);
						const cmsPdfPath = `/img/user/${linkedFile.path}`;

						const pdfEmbedHTML = `<iframe src="${encodeURI(
							cmsPdfPath,
						)}" width="100%" height="600px" title="${altText}" style="border:1px solid #ccc;"></iframe>`;

						console.log(
							`[PDF DEBUG] Transcluded: Generated iframe HTML: ${pdfEmbedHTML}`,
						);

						assets.push({ path: cmsPdfPath, content: pdfBase64 });
						imageText = imageText.replace(pdfMatch, pdfEmbedHTML);
					} catch (e) {
						console.error(
							"[PDF DEBUG] Transcluded: Error processing transcluded PDF link:",
							pdfMatch,
							e,
						);

						// matches
						if (transcludedPdfMatches && transcludedPdfMatches[i]) {
							const currentPdfMatch = transcludedPdfMatches[i];

							const [pdfNameFromFile, ...metadataParts] =
								currentPdfMatch
									.substring(
										currentPdfMatch.indexOf("[") + 2,
										currentPdfMatch.indexOf("]"),
									)
									.split("|");

							const fallbackMarkdown = `[[${pdfNameFromFile}${
								metadataParts.length > 0
									? "|" + metadataParts.join("|")
									: ""
							}]]`;

							imageText = imageText.replace(
								currentPdfMatch,
								fallbackMarkdown,
							);
						}
						continue;
					}
				}
			}

			// ![](mypdf.pdf)
			const pdfRegex = PDF_REGEX;
			const pdfMatches = text.match(pdfRegex);
			console.log(`[PDF DEBUG] Standard PDF Regex: ${pdfRegex}`);
			console.log(`[PDF DEBUG] Found standard PDF matches:`, pdfMatches);

			if (pdfMatches) {
				for (let i = 0; i < pdfMatches.length; i++) {
					const pdfMatch = pdfMatches[i];
					console.log(`[PDF DEBUG] Standard Match ${i}: ${pdfMatch}`);

					try {
						const nameStart = pdfMatch.indexOf("[") + 1;
						const nameEnd = pdfMatch.indexOf("]");
						const pdfName = pdfMatch.substring(nameStart, nameEnd);

						const pathStart = pdfMatch.lastIndexOf("(") + 1;
						const pathEnd = pdfMatch.lastIndexOf(")");
						const pdfPath = pdfMatch.substring(pathStart, pathEnd);

						console.log(
							`[PDF DEBUG] Standard: pdfName='${pdfName}', pdfPath='${pdfPath}'`,
						);

						if (pdfPath.startsWith("http")) {
							console.log(
								`[PDF DEBUG] Standard: HTTP path. Embedding directly.`,
							);

							const httpPdfEmbedHTML = `<iframe src="${encodeURI(
								pdfPath,
							)}" width="100%" height="600px" title="${
								pdfName || "External PDF"
							}" style="border:1px solid #ccc;"></iframe>`;

							console.log(
								`[PDF DEBUG] Standard HTTP: Generated iframe HTML: ${httpPdfEmbedHTML}`,
							);

							imageText = imageText.replace(
								pdfMatch,
								httpPdfEmbedHTML,
							);
							continue;
						}

						const decodedPdfPath = decodeURI(pdfPath);

						console.log(
							`[PDF DEBUG] Standard: decodedPdfPath='${decodedPdfPath}'`,
						);

						if (decodedPdfPath === "") {
							console.log(
								`[PDF DEBUG] Standard: decodedPdfPath is empty. Fallback to link.`,
							);

							const fallbackMarkdown = `[${
								pdfName || "Invalid PDF Link"
							}](${encodeURI(pdfPath)})`;

							imageText = imageText.replace(
								pdfMatch,
								fallbackMarkdown,
							);
							continue;
						}

						const linkedFile =
							this.metadataCache.getFirstLinkpathDest(
								decodedPdfPath,
								filePath, // context path
							) as TFile;

						console.log(
							`[PDF DEBUG] Standard: linkedFile for '${decodedPdfPath}' (context: '${filePath}'):`,
							linkedFile
								? {
										name: linkedFile.name,
										path: linkedFile.path,
										extension: linkedFile.extension,
										size: linkedFile.stat.size,
								  }
								: null,
						);

						if (!linkedFile || linkedFile.extension !== "pdf") {
							console.log(
								`[PDF DEBUG] Standard: linkedFile not found or not a PDF. Fallback to link. Is linkedFile valid? ${!!linkedFile}. Extension: ${linkedFile?.extension}`,
							);

							const fallbackMarkdown = `[${
								pdfName || decodedPdfPath
							}](${encodeURI(pdfPath)})`;

							imageText = imageText.replace(
								pdfMatch,
								fallbackMarkdown,
							);
							continue;
						}

						if (linkedFile.stat.size > 20 * 1024 * 1024) {
							// 20MB
							console.log(
								`[PDF DEBUG] Standard: PDF '${linkedFile.name}' too large (${linkedFile.stat.size} bytes). Fallback to link.`,
							);

							new Notice(
								`PDF ${linkedFile.name} is larger than 20MB and will not be published as an embed. A link will be used.`,
							);

							const fallbackLink = `[${
								pdfName || linkedFile.name
							} (PDF too large to embed)](${encodeURI(pdfPath)})`;

							imageText = imageText.replace(
								pdfMatch,
								fallbackLink,
							);
							continue;
						}

						console.log(
							`[PDF DEBUG] Standard: All checks passed for '${linkedFile.name}'. Proceeding to embed with iframe.`,
						);

						const pdfBinary =
							await this.vault.readBinary(linkedFile);
						const pdfBase64 = arrayBufferToBase64(pdfBinary);
						const cmsPdfPath = `/img/user/${linkedFile.path}`;

						const pdfEmbedHTML = `<iframe src="${encodeURI(
							cmsPdfPath,
						)}" width="100%" height="600px" title="${
							pdfName || linkedFile.basename
						}" style="border:1px solid #ccc;"></iframe>`;

						console.log(
							`[PDF DEBUG] Standard: Generated iframe HTML: ${pdfEmbedHTML}`,
						);

						assets.push({ path: cmsPdfPath, content: pdfBase64 });
						imageText = imageText.replace(pdfMatch, pdfEmbedHTML);
					} catch (e) {
						console.error(
							"[PDF DEBUG] Standard: Error processing PDF link:",
							pdfMatch,
							e,
						);

						if (pdfMatches && pdfMatches[i]) {
							const currentPdfMatch = pdfMatches[i];
							const nameStart = currentPdfMatch.indexOf("[") + 1;
							const nameEnd = currentPdfMatch.indexOf("]");

							const pdfName = currentPdfMatch.substring(
								nameStart,
								nameEnd,
							);

							const pathStart =
								currentPdfMatch.lastIndexOf("(") + 1;
							const pathEnd = currentPdfMatch.lastIndexOf(")");

							const pdfPath = currentPdfMatch.substring(
								pathStart,
								pathEnd,
							);

							const fallbackMarkdown = `[${
								pdfName || "Problematic PDF Link"
							}](${encodeURI(pdfPath)})`;

							imageText = imageText.replace(
								currentPdfMatch,
								fallbackMarkdown,
							);
						}
						continue;
					}
				}
			}

			console.log(
				`[PDF DEBUG] Final imageText before return:`,
				imageText.substring(0, 500) +
					(imageText.length > 500 ? "..." : ""),
			); // Log a snippet

			return [imageText, assets];
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
