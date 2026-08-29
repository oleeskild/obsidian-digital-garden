import { MetadataCache, TFile, Vault, getLinkpath } from "obsidian";
import { excaliDrawBundle, excalidraw } from "../ui/suggest/constants";
import LZString from "lz-string";
import slugify from "@sindresorhus/slugify";
import { TCompilerStep } from "./GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";
import DigitalGardenSettings from "../models/settings";
import { PathRewriteRule } from "../repositoryConnection/DigitalGardenSiteManager";
import {
	fixSvgForXmlSerializer,
	generateUrlPath,
	getGardenPathForNote,
	getRewriteRules,
	sanitizePermalink,
} from "../utils/utils";
import Logger from "js-logger";

interface IExcalidrawCompilerProps {
	/**Includes excalidraw script bundle in compilation result (legacy viewer only) */
	includeExcaliDrawJs: boolean;
	/** Is appended to the drawing id (legacy viewer only) */
	idAppendage?: string;
	/** Includes frontmatter in compilation result */
	includeFrontMatter?: boolean;
	/** Size suffix from the embed link, e.g. ![[drawing|500]], |500x300 or |100% */
	size?: string;
}

/**
 * Subset of the ExcalidrawAutomate API exposed globally by the
 * obsidian-excalidraw-plugin, used to export drawings as SVG at publish
 * time. The loader resolves image elements, embedded notes and frames,
 * which the raw drawing JSON alone cannot render.
 */
interface IExcalidrawAutomate {
	reset(): void;
	getEmbeddedFilesLoader(isDark?: boolean): unknown;
	createSVG(
		templatePath?: string,
		embedFont?: boolean,
		exportSettings?: { withBackground: boolean; withTheme: boolean },
		loader?: unknown,
		theme?: string,
		padding?: number,
	): Promise<SVGSVGElement>;
}

const getExcalidrawAutomate = (): IExcalidrawAutomate | undefined =>
	(window as unknown as { ExcalidrawAutomate?: IExcalidrawAutomate })
		.ExcalidrawAutomate;

/**
 * Detects drawings by the frontmatter key the Excalidraw plugin writes,
 * so files without the .excalidraw.md naming convention are found too.
 */
export const isExcalidrawFile = (
	file: TFile,
	metadataCache: MetadataCache,
): boolean =>
	file.name.endsWith(".excalidraw.md") ||
	(file.extension === "md" &&
		!!metadataCache.getFileCache(file)?.frontmatter?.["excalidraw-plugin"]);

/** width, or widthxheight, in pixels, or a percentage width */
const EMBED_SIZE_REGEX = /^(\d+%|\d+)(?:x(\d+))?$/;

export class ExcalidrawCompiler {
	private readonly vault: Vault;
	private readonly settings: DigitalGardenSettings;
	private readonly metadataCache: MetadataCache;
	private readonly rewriteRules: PathRewriteRule[];

	constructor(
		vault: Vault,
		settings: DigitalGardenSettings,
		metadataCache: MetadataCache,
	) {
		this.vault = vault;
		this.settings = settings;
		this.metadataCache = metadataCache;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);
	}
	compileMarkdown =
		({
			includeExcaliDrawJs,
			idAppendage = "",
			includeFrontMatter = true,
			size,
		}: IExcalidrawCompilerProps): TCompilerStep =>
		(file: PublishFile) =>
		async (fileText: string) => {
			const isDrawing =
				file.file.name.endsWith(".excalidraw.md") ||
				!!file.getMetadata()?.frontmatter?.["excalidraw-plugin"];

			if (!isDrawing) {
				throw new Error("File is not an excalidraw file");
			}

			const frontmatter = includeFrontMatter
				? file.getCompiledFrontmatter()
				: "";

			const svg = this.settings.excalidrawSvgExportEnabled
				? await this.compileToSvg(file, size)
				: null;

			if (svg !== null) {
				return `${frontmatter}${svg}`;
			}

			return `${frontmatter}${this.compileToInteractiveViewer(
				file,
				fileText,
				includeExcaliDrawJs,
				idAppendage,
			)}`;
		};

	/**
	 * Exports the drawing to a static SVG through ExcalidrawAutomate.
	 * Returns null when the Excalidraw plugin is unavailable or the export
	 * fails, in which case the legacy interactive viewer is used instead.
	 */
	private compileToSvg = async (
		file: PublishFile,
		size?: string,
	): Promise<string | null> => {
		const ea = getExcalidrawAutomate();

		if (!ea) {
			Logger.warn(
				"ExcalidrawAutomate not found, falling back to interactive excalidraw viewer. Is the Excalidraw plugin enabled?",
			);

			return null;
		}

		try {
			ea.reset();

			const svg = await ea.createSVG(
				file.getPath(),
				// Embed fonts so the hand-drawn typeface survives on the
				// published site, where Virgil is not loaded
				true,
				// Export the light theme with background: the published page
				// shows a static image, and the light canvas stays readable
				// on both site themes
				{ withBackground: true, withTheme: true },
				ea.getEmbeddedFilesLoader(false),
				"light",
			);

			this.applyEmbedSize(svg, size);
			this.rewriteSvgLinks(svg, file);
			fixSvgForXmlSerializer(svg);

			const serialized = new XMLSerializer().serializeToString(svg);

			// Strip line breaks, as markdown-it inserts <p> tags otherwise
			return `<div class="excalidraw-svg">${serialized.replace(
				/[\t\n\r]/g,
				"",
			)}</div>`;
		} catch (error) {
			Logger.error(
				`Failed to export excalidraw file ${file.getPath()} to SVG, falling back to interactive viewer`,
				error,
			);

			return null;
		}
	};

	/**
	 * Scales the drawing to its embed size while keeping the intrinsic
	 * width/height attributes for the aspect ratio.
	 */
	private applyEmbedSize(svg: SVGSVGElement, size?: string): void {
		svg.style.maxWidth = "100%";
		svg.style.height = "auto";

		const sizeMatch = size ? EMBED_SIZE_REGEX.exec(size) : null;

		if (!sizeMatch) {
			return;
		}

		const [, width, height] = sizeMatch;

		svg.style.width = width.endsWith("%") ? width : `${width}px`;

		if (height) {
			svg.style.height = `${height}px`;
		}
	}

	/**
	 * Element links come out of the export as raw wikilink hrefs, e.g.
	 * href="[[Note#Header|alias]]". Rewrite them to garden URLs; links to
	 * unresolvable or unpublished notes are dropped so the published SVG
	 * holds no dead vault references. External links are left untouched.
	 */
	private rewriteSvgLinks(svg: SVGSVGElement, file: PublishFile): void {
		const XLINK_NS = "http://www.w3.org/1999/xlink";

		svg.querySelectorAll("a").forEach((anchor) => {
			const href =
				anchor.getAttribute("href") ??
				anchor.getAttributeNS(XLINK_NS, "href");

			const wikilinkMatch = href && /^\[\[(.+?)\]\]$/.exec(href.trim());

			if (!wikilinkMatch) {
				return;
			}

			const gardenUrl = this.resolveGardenUrl(wikilinkMatch[1], file);

			anchor.removeAttributeNS(XLINK_NS, "href");

			if (gardenUrl) {
				anchor.setAttribute("href", gardenUrl);

				// Embeddable elements (inline notes) export as an empty
				// iframe; point it at the published note. The template's
				// excalidraw script swaps it for the note's content,
				// keyed on the class.
				anchor.querySelectorAll("iframe").forEach((frame) => {
					if (frame.getAttribute("src") === "about:blank") {
						frame.setAttribute("src", gardenUrl);

						frame.setAttribute("class", "excalidraw-embedded-note");
					}
				});
			} else {
				anchor.removeAttribute("href");
			}
		});
	}

	private resolveGardenUrl(
		wikilink: string,
		file: PublishFile,
	): string | null {
		// [[target#header|alias]]
		const targetWithRef = wikilink.split("|")[0].trim();
		const [target, ref] = targetWithRef.split("#");
		const sectionId = ref ? `#${slugify(ref)}` : "";

		const linkedFile =
			target === ""
				? file.file
				: this.metadataCache.getFirstLinkpathDest(
						getLinkpath(target),
						file.getPath(),
				  );

		if (!linkedFile || linkedFile.extension !== "md") {
			return null;
		}

		const frontmatter =
			this.metadataCache.getFileCache(linkedFile)?.frontmatter;

		if (!frontmatter?.["dg-publish"]) {
			return null;
		}

		const permalink = frontmatter["dg-permalink"];

		const gardenPath = permalink
			? sanitizePermalink(permalink)
			: `/${generateUrlPath(
					getGardenPathForNote(linkedFile.path, this.rewriteRules),
					this.settings.slugifyEnabled,
			  )}`;

		return `${gardenPath}${sectionId}`;
	}

	private compileToInteractiveViewer(
		file: PublishFile,
		fileText: string,
		includeExcaliDrawJs: boolean,
		idAppendage: string,
	): string {
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
			file.file.name.split(" ").join("_").replace(".", "") + idAppendage;

		let excaliDrawCode = "";

		if (includeExcaliDrawJs) {
			excaliDrawCode += excaliDrawBundle;
		}

		// Set zoom level to 1
		if (excaliDrawJson.appState) {
			excaliDrawJson.appState.zoom = { value: 1 };
		}

		excaliDrawCode += excalidraw(JSON.stringify(excaliDrawJson), drawingId);

		return excaliDrawCode;
	}
}
