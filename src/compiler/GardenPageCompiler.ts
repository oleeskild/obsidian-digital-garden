import {
	MetadataCache,
	Notice,
	TFile,
	Vault,
	arrayBufferToBase64,
	getLinkpath,
	parseYaml,
	stringifyYaml,
} from "obsidian";
import DigitalGardenSettings from "../models/settings";
import { PathRewriteRule } from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "../publisher/Publisher";
import {
	fixSvgForXmlSerializer,
	generateBlobHashFromBase64,
	generateUrlPath,
	getGardenPathForNote,
	getRewriteRules,
	sanitizePermalink,
} from "../utils/utils";
import { ExcalidrawCompiler, isExcalidrawFile } from "./ExcalidrawCompiler";
import slugify from "@sindresorhus/slugify";
import { fixMarkdownHeaderSyntax } from "../utils/markdown";
import Logger from "js-logger";
import { DataviewCompiler } from "./DataviewCompiler";
import { FastTextColorCompiler } from "./FastTextColorCompiler";
import { CanvasCompiler, ITextNodeProcessor } from "./CanvasCompiler";
import {
	MarkdownLinkNode,
	WikilinkNode,
	parseMarkdown,
	transformMarkdown,
	transformMarkdownSync,
} from "./ast";

// PDF embedding constants
const PDF_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const PDF_IFRAME_HEIGHT = "900px";
const PDF_IFRAME_STYLE = "border:1px solid #ccc;";

// HTML embedding constants
const HTML_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const HTML_IFRAME_DEFAULT_HEIGHT = "500";
const HTML_IFRAME_STYLE = "border:1px solid #ccc;";

/**
 * Vault HTML is served from the garden's own origin, so it is sandboxed
 * without allow-same-origin: scripts run, but in an opaque origin that
 * cannot read the garden's storage or reach into the parent page.
 */
const HTML_IFRAME_SANDBOX =
	"allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals";
/** External pages already live on another origin, so they keep their own. */
const EXTERNAL_HTML_IFRAME_SANDBOX = `${HTML_IFRAME_SANDBOX} allow-same-origin`;
import { PublishFile } from "../publishFile/PublishFile";
import { replaceBlockIDs } from "./replaceBlockIDs";
import { getFrontmatterImageLinkpath } from "./frontmatterImageLinks";
import { publishedBasesUseFileTimestamps } from "./basesFileTimestamps";

export { getFrontmatterImageLinkpath };

/** Extensions treated as embeddable images in the note body */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

/** Extensions embedded as sandboxed iframes in the note body */
const HTML_EXTENSIONS = [".html", ".htm"];

/** Extensions rewritten to asset links when wiki-linked (not embedded) */
const LINKED_ASSET_EXTENSIONS = [...IMAGE_EXTENSIONS, ".svg", ".pdf"];

/** Markdown-style link targets that resolve to publishable vault notes */
const NOTE_LINK_DESTINATION =
	/^\s*([^)\s]+?\.(?:md|markdown|canvas))((?:#[^)\s]*)?)\s*$/i;

const YOUTUBE_URL_REGEX =
	/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S+$/;

const hasExtension = (target: string, extensions: string[]): boolean =>
	extensions.some((extension) => target.endsWith(extension));

const escapeHtmlAttribute = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const HTML_RESOURCE_ATTRIBUTE_REGEX = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
const NON_RELATIVE_REFERENCE_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Relative src/href references in an HTML file. Only the file itself is
 * published, so these will not resolve on the garden.
 */
export const findRelativeHtmlResources = (html: string): string[] =>
	[...html.matchAll(HTML_RESOURCE_ATTRIBUTE_REGEX)]
		.map((match) => match[2].trim())
		.filter(
			(reference) =>
				reference !== "" &&
				!NON_RELATIVE_REFERENCE_REGEX.test(reference),
		);

export interface Asset {
	path: string;
	content: string;
	localHash?: string;
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

export function selectBaseView(
	baseFileText: string,
	viewName?: string,
	baseFileName?: string,
): string {
	if (!viewName) {
		return baseFileText;
	}

	const baseFileLabel = baseFileName ?? "Base file";

	try {
		const parsedBase = parseYaml(baseFileText);

		if (
			!parsedBase ||
			typeof parsedBase !== "object" ||
			!Array.isArray(parsedBase.views)
		) {
			return baseFileText;
		}

		const selectedView = parsedBase.views.find(
			(view: { name?: unknown }) => view?.name === viewName,
		);

		if (!selectedView) {
			Logger.warn(
				`Base view "${viewName}" not found in ${baseFileLabel}. Embedding all views.`,
			);

			return baseFileText;
		}

		return stringifyYaml({
			...parsedBase,
			views: [selectedView],
		});
	} catch (error) {
		Logger.warn(
			`Failed to parse ${baseFileLabel} while selecting view "${viewName}". Embedding all views.`,
			error,
		);

		return baseFileText;
	}
}

export function createBaseCodeBlock(
	baseFileText: string,
	transclusionFileName: string,
): string {
	const [baseFileName, selectedViewName] = transclusionFileName.split("#");

	return (
		"\n```base\n" +
		selectBaseView(baseFileText, selectedViewName?.trim(), baseFileName) +
		"\n```\n"
	);
}

export class GardenPageCompiler implements ITextNodeProcessor {
	private readonly vault: Vault;
	private readonly settings: DigitalGardenSettings;
	private excalidrawCompiler: ExcalidrawCompiler;
	private canvasCompiler: CanvasCompiler;
	private metadataCache: MetadataCache;
	private readonly getFilesMarkedForPublishing: Publisher["getFilesMarkedForPublishing"];

	private rewriteRules: PathRewriteRule[];

	// Whether published notes should carry ctime/mtime for bases. Resolved
	// once per publish run, before any frontmatter is compiled.
	includeFileTimestamps = false;
	private fileTimestampScan?: Promise<boolean>;

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

		this.excalidrawCompiler = new ExcalidrawCompiler(
			vault,
			settings,
			metadataCache,
		);

		this.canvasCompiler = new CanvasCompiler(
			vault,
			metadataCache,
			settings,
		);
		this.canvasCompiler.setTextNodeProcessor(this);
		this.rewriteRules = getRewriteRules(this.settings.pathRewriteRules);
	}

	/**
	 * Process text content from canvas text nodes through the same pipeline as notes.
	 * This enables wiki-links, transclusions, dataview, etc. in canvas text nodes.
	 */
	async processTextNodeContent(
		file: PublishFile,
		text: string,
		assets?: Asset[],
	): Promise<string> {
		// Apply compile steps relevant to text node content
		// Note: We skip frontmatter conversion since text nodes don't have frontmatter
		const CANVAS_TEXT_COMPILE_STEPS: TCompilerStep[] = [
			this.convertCustomFilters,
			this.createBlockIDs,
			this.createTranscludedText(0),
			this.convertDataViews,
			this.convertFastTextColor,
			this.convertLinksToFullPath,
			this.convertMarkdownLinksToFullPath,
			this.removeObsidianComments,
			this.createSvgEmbeds,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			CANVAS_TEXT_COMPILE_STEPS,
		)(text);

		const [processedText, collectedAssets] =
			await this.convertEmbeddedAssets(file)(compiledText);

		if (assets) {
			assets.push(...collectedAssets);
		}

		return processedText;
	}

	private resolveLinkedFile = (
		linkPath: string,
		sourcePath: string,
	): TFile | null => {
		if (linkPath === "") {
			return null;
		}

		return (
			this.metadataCache.getFirstLinkpathDest(linkPath, sourcePath) ??
			null
		);
	};

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

	/**
	 * Forget the cached bases scan so the next compile re-checks the vault.
	 * Call at the start of each publish-status run.
	 */
	resetFileTimestampScan() {
		this.fileTimestampScan = undefined;
	}

	private async resolveIncludeFileTimestamps() {
		this.fileTimestampScan ??= publishedBasesUseFileTimestamps(
			this.vault,
			this.metadataCache,
		);
		this.includeFileTimestamps = await this.fileTimestampScan;
	}

	async generateMarkdown(file: PublishFile): Promise<TCompiledFile> {
		const assets: Assets = { images: [] };

		await this.resolveIncludeFileTimestamps();

		const vaultFileText = await file.cachedRead();

		if (isExcalidrawFile(file.file, this.metadataCache)) {
			return [
				await this.excalidrawCompiler.compileMarkdown({
					includeExcaliDrawJs: true,
				})(file)(vaultFileText),
				assets,
			];
		}

		if (file.file.extension === "canvas") {
			return [
				await this.canvasCompiler.compileMarkdown({
					assets: assets.images,
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
			this.convertFastTextColor,
			this.convertLinksToFullPath,
			this.convertMarkdownLinksToFullPath,
			this.removeObsidianComments,
			this.createSvgEmbeds,
		];

		const compiledText = await this.runCompilerSteps(
			file,
			COMPILE_STEPS,
		)(vaultFileText);

		const [text, images] =
			await this.convertEmbeddedAssets(file)(compiledText);

		// Also extract images referenced in frontmatter properties
		const frontmatterImages = await this.extractFrontmatterAssets(file);
		images.push(...frontmatterImages);

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
		// Comments inside code blocks, inline code and injected scripts are
		// parsed as part of those nodes, so they are naturally left alone.
		return transformMarkdownSync(text, (node) =>
			node.type === "comment" ? "" : undefined,
		);
	};

	convertFrontMatter: TCompilerStep = (file) => (text) => {
		const compiledFrontmatter = file.getCompiledFrontmatter();

		return transformMarkdownSync(text, (node) =>
			node.type === "frontmatter" ? compiledFrontmatter : undefined,
		);
	};

	convertDataViews: TCompilerStep = (file) => async (text) => {
		const dataviewCompiler = new DataviewCompiler();

		return await dataviewCompiler.compile(file)(text);
	};

	convertFastTextColor: TCompilerStep = (file) => async (text) => {
		const fastTextColorCompiler = new FastTextColorCompiler(this.vault);

		return await fastTextColorCompiler.compile(file)(text);
	};

	convertLinksToFullPath: TCompilerStep = (file) => async (text) => {
		return await transformMarkdown(text, (node) => {
			if (node.type !== "wikilink") {
				return;
			}

			// Embeds still present at this point (e.g. past the
			// transclusion depth cap, or unresolvable) get their inner
			// link converted too; the ! prefix is kept.
			const embedPrefix = node.embed ? "!" : "";

			try {
				let linkedFileName = node.targetWithRef;

				if (linkedFileName.endsWith("\\")) {
					linkedFileName = linkedFileName.substring(
						0,
						linkedFileName.length - 1,
					);
				}

				const linkDisplayName = node.parts[1] || linkedFileName;
				let headerPath = "";

				// detect links to headers or blocks
				if (linkedFileName.includes("#")) {
					const headerSplit = linkedFileName.split("#");
					linkedFileName = headerSplit[0];

					//currently no support for linking to nested heading with multiple #s
					headerPath =
						headerSplit.length > 1 ? `#${headerSplit[1]}` : "";
				}

				// Same-file header link, e.g. [[#My Header]] or [[#My Header|display]]
				if (linkedFileName === "" && headerPath !== "") {
					const currentFilePath = file.getPath();

					const currentExtensionlessPath = currentFilePath.substring(
						0,
						currentFilePath.lastIndexOf("."),
					);

					return `${embedPrefix}[[${currentExtensionlessPath}${headerPath}\\|${linkDisplayName}]]`;
				}

				const fullLinkedFilePath = getLinkpath(linkedFileName);

				if (fullLinkedFilePath === "") {
					return;
				}

				const linkedFile = this.metadataCache.getFirstLinkpathDest(
					fullLinkedFilePath,
					file.getPath(),
				);

				if (!linkedFile) {
					return `${embedPrefix}[[${linkedFileName}${headerPath}\\|${linkDisplayName}]]`;
				}

				if (
					linkedFile.extension === "md" ||
					linkedFile.extension === "canvas"
				) {
					const extensionlessPath = linkedFile.path.substring(
						0,
						linkedFile.path.lastIndexOf("."),
					);

					// Keep .canvas extension in links for canvas files
					const linkPath =
						linkedFile.extension === "canvas"
							? `${extensionlessPath}.canvas`
							: extensionlessPath;

					return `${embedPrefix}[[${linkPath}${headerPath}\\|${linkDisplayName}]]`;
				}

				return;
			} catch (e) {
				console.log(e);

				return;
			}
		});
	};

	/**
	 * Converts markdown-style links to vault files (e.g. [X](../a/b.md),
	 * written by Obsidian's "relative"/"shortest path" markdown link formats
	 * or by external tools) into full-path wikilinks, the same output as
	 * convertLinksToFullPath. Published relative hrefs would otherwise break
	 * under the site's trailing-slash URLs and stay invisible to the graph.
	 */
	convertMarkdownLinksToFullPath: TCompilerStep = (file) => async (text) => {
		const decode = (value: string) => {
			try {
				return decodeURIComponent(value);
			} catch {
				return value;
			}
		};

		// Resolve "./" and "../" against the source file's directory,
		// since getFirstLinkpathDest expects vault-rooted link paths.
		const resolveRelative = (target: string): string | null => {
			const sourcePath = file.getPath();

			const sourceDir = sourcePath.includes("/")
				? sourcePath.substring(0, sourcePath.lastIndexOf("/"))
				: "";

			const segments: string[] = sourceDir ? sourceDir.split("/") : [];

			for (const part of target.split("/")) {
				if (part === "" || part === ".") continue;

				if (part === "..") {
					if (segments.length === 0) return null;
					segments.pop();
					continue;
				}
				segments.push(part);
			}

			return segments.join("/");
		};

		return await transformMarkdown(text, (node) => {
			if (node.type !== "mdlink" || node.embed) {
				return;
			}

			const destinationMatch = NOTE_LINK_DESTINATION.exec(
				node.destination,
			);

			if (!destinationMatch) {
				return;
			}

			try {
				const [, rawTarget, rawFragment] = destinationMatch;
				const displayText = node.label;

				if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
					return;
				}

				const target = decode(rawTarget);

				const isExplicitRelative =
					target.startsWith("./") || target.startsWith("../");

				const relativeTarget = resolveRelative(target);

				// Obsidian resolves markdown links against the vault
				// (full path or unique basename) with the raw target;
				// explicitly relative targets resolve against the file.
				const candidates = isExplicitRelative
					? [relativeTarget, target]
					: [target, relativeTarget];

				let linkedFile: TFile | null = null;

				for (const candidate of candidates) {
					if (candidate === null) continue;

					linkedFile = this.metadataCache.getFirstLinkpathDest(
						candidate,
						file.getPath(),
					);

					if (linkedFile) break;
				}

				if (
					!linkedFile ||
					(linkedFile.extension !== "md" &&
						linkedFile.extension !== "canvas")
				) {
					return;
				}

				const extensionlessPath = linkedFile.path.substring(
					0,
					linkedFile.path.lastIndexOf("."),
				);

				// Keep .canvas extension in links for canvas files
				const linkPath =
					linkedFile.extension === "canvas"
						? `${extensionlessPath}.canvas`
						: extensionlessPath;

				const headerPath = decode(rawFragment ?? "");

				const linkDisplayName =
					displayText ||
					extensionlessPath.substring(
						extensionlessPath.lastIndexOf("/") + 1,
					);

				return `[[${linkPath}${headerPath}\\|${linkDisplayName}]]`;
			} catch (e) {
				console.log(e);

				return;
			}
		});
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

			let numberOfExcaliDraws = 0;

			return await transformMarkdown(text, async (node) => {
				if (node.type !== "wikilink" || !node.embed) {
					return;
				}

				try {
					const transclusionFileName = node.targetWithRef;
					const headerName = node.parts[1];

					// Check if it's a YouTube URL embed
					const youtubeId =
						this.extractYouTubeId(transclusionFileName);

					if (youtubeId) {
						return `<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${youtubeId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
					}

					const transclusionFilePath =
						getLinkpath(transclusionFileName);

					if (transclusionFilePath === "") {
						return;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						transclusionFilePath,
						file.getPath(),
					);

					if (!linkedFile) {
						console.error(
							`can't find transcluded file ${transclusionFilePath}`,
						);

						return;
					}

					const publishLinkedFile = new PublishFile({
						file: linkedFile,
						compiler: this,
						metadataCache: this.metadataCache,
						vault: this.vault,
						settings: this.settings,
					});
					let sectionID = "";

					if (isExcalidrawFile(linkedFile, this.metadataCache)) {
						numberOfExcaliDraws++;
						const isFirstDrawing = numberOfExcaliDraws === 1;

						const fileText = await publishLinkedFile.cachedRead();

						return await this.excalidrawCompiler.compileMarkdown({
							includeExcaliDrawJs: isFirstDrawing,
							idAppendage: `${numberOfExcaliDraws}`,
							includeFrontMatter: false,
							size: node.parts[1],
						})(publishLinkedFile)(fileText);
					}

					if (linkedFile.extension === "base") {
						// Embed .base file contents as a ```base code block
						const baseFileText = await this.vault.read(linkedFile);

						return createBaseCodeBlock(
							baseFileText,
							transclusionFileName,
						);
					}

					if (linkedFile.extension !== "md") {
						// Images, PDFs etc. are handled by later steps
						return;
					}

					let fileText = await publishLinkedFile.cachedRead();

					const metadata = publishLinkedFile.getMetadata();

					if (transclusionFileName.includes("#^")) {
						// Transclude Block
						const refBlock = transclusionFileName.split("#^")[1];

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
						const refHeader = transclusionFileName.split("#")[1];

						// This is to mitigate the issue where the header matching doesn't work properly with headers with special characters (e.g. :)
						// Obsidian's autocomplete for transclusion omits such charcters which leads to full page transclusion instead of just the heading
						const headerSlug = slugify(refHeader);

						const headerInFile = metadata?.headings?.find(
							(header) => slugify(header.heading) === headerSlug,
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
								const cutToLine = cutTo?.position?.start?.line;

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

					//Remove frontmatter and block references from transclusion
					fileText = transformMarkdownSync(fileText, (inner) =>
						inner.type === "frontmatter" || inner.type === "blockid"
							? ""
							: undefined,
					);

					// Apply custom filters to transclusion
					fileText =
						await this.convertCustomFilters(publishLinkedFile)(
							fileText,
						);

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

					// Recurse into nested transclusions (up to the depth cap)
					if (fileText.includes("![[")) {
						fileText = await this.createTranscludedText(
							currentDepth + 1,
						)(publishLinkedFile)(fileText);
					}

					// compile dataview in transcluded text
					fileText = await this.runCompilerSteps(publishLinkedFile, [
						this.convertDataViews,
					])(fileText);

					return fileText;
				} catch (error) {
					console.error(error);

					return;
				}
			});
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

		const readSvg = async (
			imagePath: string,
			size: string | undefined,
		): Promise<string | null> => {
			if (imagePath === "") {
				return null;
			}

			const linkedFile = this.metadataCache.getFirstLinkpathDest(
				imagePath,
				file.getPath(),
			);

			if (!linkedFile) {
				return null;
			}

			let svgText = await this.vault.read(linkedFile);

			if (svgText && size) {
				svgText = setWidth(svgText, size);
			}

			return svgText;
		};

		return await transformMarkdown(text, async (node) => {
			// ![[image.svg]] or ![[image.svg|size]]
			if (
				node.type === "wikilink" &&
				node.embed &&
				node.targetWithRef.endsWith(".svg")
			) {
				try {
					const [imageName, size] = node.parts;

					let svgText = await readSvg(getLinkpath(imageName), size);

					if (!svgText) {
						return;
					}

					//Remove whitespace, as markdown-it will insert a <p> tag otherwise
					svgText = svgText.replace(/[\t\n\r]/g, "");

					return svgText;
				} catch {
					return;
				}
			}

			// ![alt](image.svg)
			if (
				node.type === "mdlink" &&
				node.embed &&
				node.destination.endsWith(".svg")
			) {
				try {
					const imagePath = node.destination;

					if (imagePath.startsWith("http")) {
						return;
					}

					const size = node.label.split(/\\?\|/)[1];

					const svgText = await readSvg(imagePath, size);

					return svgText ?? undefined;
				} catch {
					return;
				}
			}

			return;
		});
	};

	/**
	 * Collect image linkpaths referenced by frontmatter properties
	 * (plain paths, wikilinks, or arrays of either).
	 */
	private getFrontmatterImageLinkpaths(file: PublishFile): string[] {
		const linkpaths: string[] = [];

		const frontmatter = this.metadataCache.getFileCache(file.file)
			?.frontmatter;

		if (!frontmatter) return linkpaths;

		const scanValue = (value: unknown) => {
			const linkpath = getFrontmatterImageLinkpath(value);

			if (linkpath) {
				linkpaths.push(linkpath);
			} else if (Array.isArray(value)) {
				value.forEach(scanValue);
			}
		};

		for (const [key, value] of Object.entries(frontmatter)) {
			if (key === "position") continue;
			scanValue(value);
		}

		return linkpaths;
	}

	/**
	 * Scan frontmatter properties for values that look like image paths
	 * and include them as assets so they get published alongside the note.
	 */
	private async extractFrontmatterAssets(
		file: PublishFile,
	): Promise<Array<Asset>> {
		const assets: Array<Asset> = [];

		for (const linkpath of this.getFrontmatterImageLinkpaths(file)) {
			try {
				const linkedFile = this.resolveLinkedFile(
					linkpath,
					file.getPath(),
				);

				if (!linkedFile) continue;

				const image = await this.vault.readBinary(linkedFile);
				const imageBase64 = arrayBufferToBase64(image);

				assets.push({
					path: `/img/user/${linkedFile.path}`,
					content: imageBase64,
					localHash: generateBlobHashFromBase64(imageBase64),
				});
			} catch {
				// Skip unresolvable paths
			}
		}

		return assets;
	}

	extractImageLinks = async (file: PublishFile) => {
		const text = await file.cachedRead();
		const assets: string[] = [];

		for (const node of parseMarkdown(text)) {
			try {
				// ![[image.png]], ![[file.pdf]] or ![[page.html]]
				if (
					node.type === "wikilink" &&
					node.embed &&
					hasExtension(node.targetWithRef, [
						...IMAGE_EXTENSIONS,
						".pdf",
						...HTML_EXTENSIONS,
					])
				) {
					const linkedFile = this.resolveLinkedFile(
						getLinkpath(node.parts[0]),
						file.getPath(),
					);

					if (linkedFile) {
						assets.push(linkedFile.path);
					}
					continue;
				}

				// ![](image.png), ![](file.pdf) or ![](page.html)
				if (
					node.type === "mdlink" &&
					node.embed &&
					hasExtension(node.destination, [
						...IMAGE_EXTENSIONS,
						".pdf",
						...HTML_EXTENSIONS,
					]) &&
					!node.destination.startsWith("http")
				) {
					const linkedFile = this.resolveLinkedFile(
						decodeURI(node.destination),
						file.getPath(),
					);

					if (linkedFile) {
						assets.push(linkedFile.path);
					}
					continue;
				}

				// [[image.png]] or [[file.pdf]] (linked, not embedded)
				if (
					node.type === "wikilink" &&
					!node.embed &&
					hasExtension(node.linkpath, LINKED_ASSET_EXTENSIONS)
				) {
					const linkedFile = this.resolveLinkedFile(
						getLinkpath(node.linkpath),
						file.getPath(),
					);

					if (linkedFile) {
						assets.push(linkedFile.path);
					}
				}
			} catch {
				continue;
			}
		}

		// Frontmatter image properties (e.g. cover) are published by
		// extractFrontmatterAssets, so they must be tracked here too or
		// they get flagged as orphaned and deleted on batch publishes.
		for (const linkpath of this.getFrontmatterImageLinkpaths(file)) {
			const linkedFile = this.resolveLinkedFile(linkpath, file.getPath());

			if (linkedFile) {
				assets.push(linkedFile.path);
			}
		}

		return assets;
	};

	convertEmbeddedAssets =
		(file: PublishFile) =>
		async (text: string): Promise<[string, Array<Asset>]> => {
			const filePath = file.getPath();
			const assets: Array<Asset> = [];

			const readAsset = async (linkedFile: TFile): Promise<string> => {
				const binary = await this.vault.readBinary(linkedFile);
				const base64 = arrayBufferToBase64(binary);
				const cmsPath = `/img/user/${linkedFile.path}`;

				assets.push({
					path: cmsPath,
					content: base64,
					localHash: generateBlobHashFromBase64(base64),
				});

				return cmsPath;
			};

			// Helper function to generate PDF iframe HTML
			const generatePdfIframe = (src: string, title: string): string => {
				return `<iframe src="${encodeURI(
					src,
				)}" width="100%" height="${PDF_IFRAME_HEIGHT}" title="${title}" style="${PDF_IFRAME_STYLE}"></iframe>`;
			};

			const generateHtmlIframe = (
				src: string,
				title: string,
				height: string,
				sandbox: string,
			): string => {
				return `<iframe class="html-embed" src="${encodeURI(
					src,
				)}" width="100%" height="${height}" title="${escapeHtmlAttribute(
					title,
				)}" sandbox="${sandbox}" loading="lazy" style="${HTML_IFRAME_STYLE}"></iframe>`;
			};

			// Shared by the wikilink and markdown link forms of a vault HTML
			// embed. Returns undefined when the file is too large to embed.
			const embedVaultHtmlFile = async (
				linkedFile: TFile,
				title: string,
				height: string,
			): Promise<string | undefined> => {
				if (linkedFile.stat.size > HTML_MAX_SIZE_BYTES) {
					new Notice(
						`HTML file ${linkedFile.name} is larger than 20MB and will not be published as an embed. A link will be used.`,
					);

					return;
				}

				const relativeResources = findRelativeHtmlResources(
					await this.vault.cachedRead(linkedFile),
				);

				if (relativeResources.length > 0) {
					new Notice(
						`${
							linkedFile.name
						} references files that are not published with it (${relativeResources
							.slice(0, 3)
							.join(
								", ",
							)}). Only self-contained HTML files display fully on the garden.`,
						10000,
					);
				}

				const cmsHtmlPath = await readAsset(linkedFile);

				return generateHtmlIframe(
					cmsHtmlPath,
					title,
					height,
					HTML_IFRAME_SANDBOX,
				);
			};

			// Helper function to build wikilink fallback
			const buildWikilinkFallback = (
				name: string,
				metadataParts: string[],
				displayText?: string,
			): string => {
				const display = displayText
					? `|${displayText}`
					: metadataParts.length > 0
					? "|" + metadataParts.join("|")
					: "";

				return `[[${name}${display}]]`;
			};

			// ![[image.png]] with optional |metadata|size suffixes
			const convertEmbeddedImageWikilink = async (
				node: WikilinkNode,
			): Promise<string | undefined> => {
				try {
					const [imageName, ...metaDataAndSize] = node.parts;

					const lastValue =
						metaDataAndSize[metaDataAndSize.length - 1];

					const hasSeveralValues = metaDataAndSize.length > 0;

					const lastValueIsSize =
						hasSeveralValues && !isNaN(parseInt(lastValue));

					const lastValueIsMetaData =
						!lastValueIsSize && hasSeveralValues;

					const size = lastValueIsSize ? lastValue : null;

					let metaData = "";

					const metaDataIsMiddleValues = metaDataAndSize.length > 1;

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

					const linkedFile = this.resolveLinkedFile(
						getLinkpath(imageName),
						filePath,
					);

					if (!linkedFile) {
						return;
					}

					const cmsImgPath = await readAsset(linkedFile);
					let name = "";

					if (metaData && size) {
						name = `${imageName}\\|${metaData}\\|${size}`;
					} else if (size) {
						name = `${imageName}\\|${size}`;
					} else if (metaData && metaData !== "") {
						name = `${imageName}\\|${metaData}`;
					} else {
						name = imageName;
					}

					return `![${name}](${encodeURI(cmsImgPath)})`;
				} catch (e) {
					return;
				}
			};

			// ![[mypdf.pdf]]
			const convertEmbeddedPdfWikilink = async (
				node: WikilinkNode,
			): Promise<string | undefined> => {
				const [pdfNameFromFile, ...metadataParts] = node.parts;

				try {
					const altText = metadataParts.join("|") || pdfNameFromFile;
					const pdfPath = getLinkpath(pdfNameFromFile);

					if (pdfPath === "") {
						return buildWikilinkFallback(
							pdfNameFromFile,
							metadataParts,
						);
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						pdfPath,
						filePath,
					) as TFile;

					if (!linkedFile || linkedFile.extension !== "pdf") {
						return buildWikilinkFallback(
							pdfNameFromFile,
							metadataParts,
						);
					}

					if (linkedFile.stat.size > PDF_MAX_SIZE_BYTES) {
						new Notice(
							`PDF ${linkedFile.name} is larger than 20MB and will not be published as an embed. A link will be used.`,
						);

						return buildWikilinkFallback(
							pdfNameFromFile,
							metadataParts,
							"PDF too large to embed",
						);
					}

					const cmsPdfPath = await readAsset(linkedFile);

					return generatePdfIframe(cmsPdfPath, altText);
				} catch (e) {
					Logger.warn("Error processing transcluded PDF link:", e);

					return buildWikilinkFallback(
						pdfNameFromFile,
						metadataParts,
					);
				}
			};

			// ![[page.html]], ![[page.html|600]] or ![[page.html|title|600]]
			const convertEmbeddedHtmlWikilink = async (
				node: WikilinkNode,
			): Promise<string | undefined> => {
				const [htmlName, ...metadataParts] = node.parts;

				try {
					const lastPart = metadataParts[metadataParts.length - 1];

					const lastPartIsHeight =
						lastPart !== undefined && /^\d+$/.test(lastPart.trim());

					const height = lastPartIsHeight
						? lastPart.trim()
						: HTML_IFRAME_DEFAULT_HEIGHT;

					const titleParts = lastPartIsHeight
						? metadataParts.slice(0, -1)
						: metadataParts;

					const linkedFile = this.resolveLinkedFile(
						getLinkpath(htmlName),
						filePath,
					);

					if (
						!linkedFile ||
						!hasExtension(
							`.${linkedFile.extension}`,
							HTML_EXTENSIONS,
						)
					) {
						return buildWikilinkFallback(htmlName, metadataParts);
					}

					const title = titleParts.join("|") || linkedFile.basename;

					return (
						(await embedVaultHtmlFile(linkedFile, title, height)) ??
						buildWikilinkFallback(
							htmlName,
							metadataParts,
							"HTML too large to embed",
						)
					);
				} catch (e) {
					Logger.warn("Error processing embedded HTML link:", e);

					return buildWikilinkFallback(htmlName, metadataParts);
				}
			};

			// ![](page.html) or ![](https://example.com/page.html)
			const convertEmbeddedHtmlMarkdownLink = async (
				node: MarkdownLinkNode,
			): Promise<string | undefined> => {
				const htmlPath = node.destination;

				try {
					if (htmlPath.startsWith("http")) {
						return generateHtmlIframe(
							htmlPath,
							node.label || "External page",
							HTML_IFRAME_DEFAULT_HEIGHT,
							EXTERNAL_HTML_IFRAME_SANDBOX,
						);
					}

					const linkedFile = this.resolveLinkedFile(
						decodeURI(htmlPath),
						filePath,
					);

					if (
						!linkedFile ||
						!hasExtension(
							`.${linkedFile.extension}`,
							HTML_EXTENSIONS,
						)
					) {
						return;
					}

					return (
						(await embedVaultHtmlFile(
							linkedFile,
							node.label || linkedFile.basename,
							HTML_IFRAME_DEFAULT_HEIGHT,
						)) ??
						`[${
							node.label || linkedFile.name
						} (HTML too large to embed)](${encodeURI(htmlPath)})`
					);
				} catch (e) {
					Logger.warn("Error processing HTML link:", e);

					return;
				}
			};

			// ![](image.png)
			const convertEmbeddedImageMarkdownLink = async (
				node: MarkdownLinkNode,
			): Promise<string | undefined> => {
				try {
					const imagePath = node.destination;

					if (imagePath.startsWith("http")) {
						return;
					}

					const linkedFile = this.resolveLinkedFile(
						decodeURI(imagePath),
						filePath,
					);

					if (!linkedFile) {
						return;
					}

					const cmsImgPath = await readAsset(linkedFile);

					return `![${node.label}](${encodeURI(cmsImgPath)})`;
				} catch (e) {
					Logger.warn("Error processing image link:", e);

					return;
				}
			};

			// ![](mypdf.pdf)
			const convertEmbeddedPdfMarkdownLink = async (
				node: MarkdownLinkNode,
			): Promise<string | undefined> => {
				const pdfName = node.label;
				const pdfPath = node.destination;

				try {
					// External PDF - embed directly
					if (pdfPath.startsWith("http")) {
						return generatePdfIframe(
							pdfPath,
							pdfName || "External PDF",
						);
					}

					const decodedPdfPath = decodeURI(pdfPath);

					if (decodedPdfPath === "") {
						return `[${pdfName || "Invalid PDF Link"}](${encodeURI(
							pdfPath,
						)})`;
					}

					const linkedFile = this.metadataCache.getFirstLinkpathDest(
						decodedPdfPath,
						filePath,
					) as TFile;

					if (!linkedFile || linkedFile.extension !== "pdf") {
						return `[${pdfName || decodedPdfPath}](${encodeURI(
							pdfPath,
						)})`;
					}

					if (linkedFile.stat.size > PDF_MAX_SIZE_BYTES) {
						new Notice(
							`PDF ${linkedFile.name} is larger than 20MB and will not be published as an embed. A link will be used.`,
						);

						return `[${
							pdfName || linkedFile.name
						} (PDF too large to embed)](${encodeURI(pdfPath)})`;
					}

					const cmsPdfPath = await readAsset(linkedFile);

					return generatePdfIframe(
						cmsPdfPath,
						pdfName || linkedFile.basename,
					);
				} catch (e) {
					Logger.warn("Error processing PDF link:", e);

					return `[${pdfName || "PDF"}](${encodeURI(pdfPath)})`;
				}
			};

			// [[image.png]] or [[file.pdf]] (linked, not embedded)
			const convertLinkedAssetWikilink = (
				node: WikilinkNode,
			): string | undefined => {
				try {
					const pipeIndex = node.inner.indexOf("|");

					let linkedFileName =
						pipeIndex === -1
							? node.inner
							: node.inner.substring(0, pipeIndex);

					const linkDisplayName =
						pipeIndex === -1
							? linkedFileName
							: node.inner.substring(pipeIndex + 1);

					if (linkedFileName.endsWith("\\")) {
						linkedFileName = linkedFileName.substring(
							0,
							linkedFileName.length - 1,
						);
					}

					const linkedFile = this.resolveLinkedFile(
						getLinkpath(linkedFileName),
						filePath,
					);

					if (!linkedFile) {
						return;
					}

					const cmsImgPath = `/img/user/${linkedFile.path}`;

					return `[${linkDisplayName}](${encodeURI(cmsImgPath)})`;
				} catch (e) {
					Logger.warn("Error processing linked image:", e);

					return;
				}
			};

			const convertedText = await transformMarkdown(
				text,
				async (node) => {
					// Frontmatter is left untouched: property values like
					// cover: "[[image.png]]" must reach the site as-is so
					// the bases engine can resolve them.
					if (node.type === "wikilink" && node.embed) {
						if (
							hasExtension(node.targetWithRef, IMAGE_EXTENSIONS)
						) {
							return convertEmbeddedImageWikilink(node);
						}

						if (node.targetWithRef.endsWith(".pdf")) {
							return convertEmbeddedPdfWikilink(node);
						}

						if (hasExtension(node.targetWithRef, HTML_EXTENSIONS)) {
							return convertEmbeddedHtmlWikilink(node);
						}

						return;
					}

					if (node.type === "mdlink" && node.embed) {
						const youtubeId = YOUTUBE_URL_REGEX.test(
							node.destination,
						)
							? this.extractYouTubeId(node.destination)
							: null;

						if (youtubeId) {
							return `<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${youtubeId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
						}

						if (hasExtension(node.destination, IMAGE_EXTENSIONS)) {
							return convertEmbeddedImageMarkdownLink(node);
						}

						if (node.destination.endsWith(".pdf")) {
							return convertEmbeddedPdfMarkdownLink(node);
						}

						if (hasExtension(node.destination, HTML_EXTENSIONS)) {
							return convertEmbeddedHtmlMarkdownLink(node);
						}

						return;
					}

					if (
						node.type === "wikilink" &&
						!node.embed &&
						hasExtension(node.linkpath, LINKED_ASSET_EXTENSIONS)
					) {
						return convertLinkedAssetWikilink(node);
					}

					return;
				},
			);

			return [convertedText, assets];
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

	private extractYouTubeId(url: string): string | null {
		const patterns = [
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
			/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
		];

		for (const pattern of patterns) {
			const match = url.match(pattern);

			if (match && match[1]) {
				return match[1];
			}
		}

		return null;
	}
}
