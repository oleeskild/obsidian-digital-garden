import { MetadataCache, Vault, getLinkpath } from "obsidian";
import { TCompilerStep, Asset } from "./GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";
import DigitalGardenSettings from "../models/settings";
import {
	arrayBufferToBase64,
	generateBlobHashFromBase64,
	generateUrlPath,
	getGardenPathForNote,
	getRewriteRules,
	sanitizePermalink,
} from "../utils/utils";
import { FrontmatterCompiler } from "./FrontmatterCompiler";

// Interface for text node processing - allows GardenPageCompiler to provide its compile steps
export interface ITextNodeProcessor {
	processTextNodeContent: (
		file: PublishFile,
		text: string,
	) => Promise<string>;
}

// JSON Canvas spec types (https://jsoncanvas.org/spec/1.0/)
interface CanvasColor {
	color?: string; // hex or "1"-"6" for presets
}

interface CanvasStyleAttributes {
	textAlign?: "left" | "center" | "right";
}

interface CanvasNodeBase extends CanvasColor {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	styleAttributes?: CanvasStyleAttributes;
}

interface CanvasTextNode extends CanvasNodeBase {
	type: "text";
	text: string;
}

interface CanvasFileNode extends CanvasNodeBase {
	type: "file";
	file: string;
	subpath?: string;
}

interface CanvasLinkNode extends CanvasNodeBase {
	type: "link";
	url: string;
}

interface CanvasGroupNode extends CanvasNodeBase {
	type: "group";
	label?: string;
	background?: string;
	backgroundStyle?: "cover" | "ratio" | "repeat";
}

type CanvasNode =
	| CanvasTextNode
	| CanvasFileNode
	| CanvasLinkNode
	| CanvasGroupNode;

interface CanvasEdge extends CanvasColor {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	toSide?: "top" | "right" | "bottom" | "left";
	fromEnd?: "none" | "arrow";
	toEnd?: "none" | "arrow";
	label?: string;
}

interface CanvasMetadata {
	version?: string;
	frontmatter?: Record<string, unknown>;
}

interface CanvasData {
	nodes?: CanvasNode[];
	edges?: CanvasEdge[];
	metadata?: CanvasMetadata;
}

interface ICanvasCompilerProps {
	idAppendage?: string;
	includeFrontMatter?: boolean;
	assets?: Asset[];
}

// Color presets from JSON Canvas spec
const COLOR_PRESETS: Record<string, string> = {
	"1": "#fb464c", // red
	"2": "#e9973f", // orange
	"3": "#e0de71", // yellow
	"4": "#44cf6e", // green
	"5": "#53dfdd", // cyan
	"6": "#a882ff", // purple
};

function resolveColor(color?: string): string | undefined {
	if (!color) return undefined;

	if (color.startsWith("#")) return color;

	return COLOR_PRESETS[color];
}

function colorToId(color: string): string {
	return color.replace(/[^a-zA-Z0-9]/g, "").substring(0, 20);
}

export class CanvasCompiler {
	private readonly vault: Vault;
	private readonly metadataCache: MetadataCache;
	private readonly settings: DigitalGardenSettings;
	private textNodeProcessor?: ITextNodeProcessor;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: DigitalGardenSettings,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
	}

	setTextNodeProcessor(processor: ITextNodeProcessor): void {
		this.textNodeProcessor = processor;
	}

	compileMarkdown =
		({
			idAppendage = "",
			includeFrontMatter = true,
			assets = [],
		}: ICanvasCompilerProps = {}): TCompilerStep =>
		(file: PublishFile) =>
		async (fileText: string) => {
			if (!file.file.name.endsWith(".canvas")) {
				throw new Error("File is not a canvas file");
			}

			const canvasData: CanvasData = JSON.parse(fileText);

			const canvasId =
				file.file.name.split(" ").join("_").replace(".", "") +
				idAppendage;

			// Build HTML for the canvas (async to support text node processing and image collection)
			const nodesHtml = await this.buildNodesHtml(
				canvasData.nodes || [],
				file,
				assets,
			);

			const edgesSvg = this.buildEdgesSvg(
				canvasData.edges || [],
				canvasData.nodes || [],
			);

			const canvasCode = this.renderCanvas(canvasId, nodesHtml, edgesSvg);

			// Compile frontmatter from canvas metadata
			let compiledFrontmatter = "";

			if (includeFrontMatter) {
				const frontmatterCompiler = new FrontmatterCompiler(
					this.settings,
				);

				// Use the configured contentClassesKey to add canvas-page class
				const contentClassesKey =
					this.settings.contentClassesKey || "contentClasses";

				const existingClasses =
					canvasData.metadata?.frontmatter?.[contentClassesKey];

				const canvasPageClass = existingClasses
					? `${existingClasses} canvas-page`
					: "canvas-page";

				const canvasFrontmatter = {
					...(canvasData.metadata?.frontmatter ?? {}),
					[contentClassesKey]: canvasPageClass,
				};

				compiledFrontmatter = frontmatterCompiler.compile(
					file,
					canvasFrontmatter as Record<string, unknown>,
				);
			}

			return `${compiledFrontmatter}${canvasCode}`;
		};

	private async buildNodesHtml(
		nodes: CanvasNode[],
		file: PublishFile,
		assets: Asset[],
	): Promise<string> {
		const nodeHtmls = await Promise.all(
			nodes.map((node) => this.buildNodeHtml(node, file, assets)),
		);

		return nodeHtmls.join("\n");
	}

	private async buildNodeHtml(
		node: CanvasNode,
		file: PublishFile,
		assets: Asset[],
	): Promise<string> {
		const color = resolveColor(node.color);
		const colorStyle = color ? `--canvas-color: ${color};` : "";
		const colorClass = color ? "has-color" : "";

		const baseStyle = `transform: translate(${node.x}px, ${node.y}px); width: ${node.width}px; height: ${node.height}px; ${colorStyle}`;

		switch (node.type) {
			case "text":
				return await this.buildTextNode(
					node,
					baseStyle,
					colorClass,
					file,
				);
			case "file":
				return await this.buildFileNode(
					node,
					baseStyle,
					colorClass,
					file,
					assets,
				);
			case "link":
				return this.buildLinkNode(node, baseStyle, colorClass);
			case "group":
				return await this.buildGroupNode(
					node,
					baseStyle,
					colorClass,
					file,
					assets,
				);
			default:
				return "";
		}
	}

	private async buildTextNode(
		node: CanvasTextNode,
		baseStyle: string,
		colorClass: string,
		file: PublishFile,
	): Promise<string> {
		// Process text node content through the same pipeline as regular notes
		let processedText = node.text;

		if (this.textNodeProcessor) {
			try {
				processedText =
					await this.textNodeProcessor.processTextNodeContent(
						file,
						node.text,
					);
			} catch (e) {
				console.error("Error processing canvas text node:", e);
				// Fall back to raw text on error
			}
		}

		// Store processed markdown in base64 data attribute for 11ty to render at build time
		const base64Markdown = Buffer.from(processedText).toString("base64");

		// Apply text alignment from styleAttributes
		const textAlign = node.styleAttributes?.textAlign;
		const contentStyle = textAlign ? `text-align: ${textAlign};` : "";

		return `<div class="canvas-node canvas-node-text ${colorClass}" data-node-id="${
			node.id
		}" style="${baseStyle}">
	<div class="canvas-node-container">
		<div class="canvas-node-content markdown-rendered"${
			contentStyle ? ` style="${contentStyle}"` : ""
		}>
			<div class="canvas-node-text-content" data-markdown="${base64Markdown}"></div>
		</div>
	</div>
</div>`;
	}

	private async buildFileNode(
		node: CanvasFileNode,
		baseStyle: string,
		colorClass: string,
		file: PublishFile,
		assets: Asset[],
	): Promise<string> {
		// Check if it's an image
		const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(node.file);

		if (isImage) {
			// Resolve the image file path through metadataCache
			const linkedFile = this.metadataCache.getFirstLinkpathDest(
				getLinkpath(node.file),
				file.getPath(),
			);

			if (linkedFile) {
				// Read image and add to assets
				try {
					const imageData = await this.vault.readBinary(linkedFile);
					const imageBase64 = arrayBufferToBase64(imageData);
					const imgPath = `/img/user/${linkedFile.path}`;

					assets.push({
						path: imgPath,
						content: imageBase64,
						localHash: generateBlobHashFromBase64(imageBase64),
					});

					const altText = node.file.split("/").pop() || node.file;

					return `<div class="canvas-node canvas-node-file canvas-node-image ${colorClass}" data-node-id="${
						node.id
					}" style="${baseStyle}">
	<div class="canvas-node-container">
		<div class="canvas-node-content image-embed">
			<img src="${encodeURI(imgPath)}" alt="${this.escapeHtml(
				altText,
			)}" loading="lazy" />
		</div>
	</div>
</div>`;
				} catch (e) {
					console.error("Error reading canvas image:", e);
				}
			}

			// Fallback if file not found or error
			const resolvedPath = linkedFile?.path || node.file;
			const imgPath = encodeURI(`/img/user/${resolvedPath}`);
			const altText = node.file.split("/").pop() || node.file;

			return `<div class="canvas-node canvas-node-file canvas-node-image ${colorClass}" data-node-id="${
				node.id
			}" style="${baseStyle}">
	<div class="canvas-node-container">
		<div class="canvas-node-content image-embed">
			<img src="${imgPath}" alt="${this.escapeHtml(altText)}" loading="lazy" />
		</div>
	</div>
</div>`;
		}

		// Resolve the file path to a garden URL for non-image files
		const gardenUrl = this.resolveFileToGardenUrl(node.file, file);
		const subpath = node.subpath || "";
		const fullUrl = gardenUrl + subpath;

		// For markdown files, use an iframe
		const label = node.file.replace(/\.md$/, "").split("/").pop() || "";

		return `<div class="canvas-node canvas-node-file ${colorClass}" data-node-id="${
			node.id
		}" data-file-path="${this.escapeHtml(node.file)}" style="${baseStyle}">
	<div class="canvas-node-label">${this.escapeHtml(label)}</div>
	<div class="canvas-node-container">
		<div class="canvas-node-content markdown-embed">
			<iframe src="${fullUrl}" class="canvas-file-iframe" loading="lazy"></iframe>
		</div>
	</div>
</div>`;
	}

	private buildLinkNode(
		node: CanvasLinkNode,
		baseStyle: string,
		colorClass: string,
	): string {
		const url = node.url;

		// Check if it's a YouTube video
		const youtubeId = this.extractYouTubeId(url);

		if (youtubeId) {
			return `<div class="canvas-node canvas-node-link canvas-node-youtube ${colorClass}" data-node-id="${node.id}" style="${baseStyle}">
	<div class="canvas-node-label">YouTube</div>
	<div class="canvas-node-container">
		<div class="canvas-node-content">
			<iframe src="https://www.youtube.com/embed/${youtubeId}" class="canvas-youtube-iframe" loading="lazy" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
		</div>
	</div>
</div>`;
		}

		// Extract domain for label
		let label = url;

		try {
			const urlObj = new URL(url);
			label = urlObj.hostname;
		} catch {
			// Keep full URL as label if parsing fails
		}

		return `<div class="canvas-node canvas-node-link ${colorClass}" data-node-id="${
			node.id
		}" style="${baseStyle}">
	<div class="canvas-node-label">${this.escapeHtml(label)}</div>
	<div class="canvas-node-container">
		<div class="canvas-node-content">
			<iframe src="${this.escapeHtml(
				url,
			)}" class="canvas-link-iframe" loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe>
		</div>
	</div>
</div>`;
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

	private async buildGroupNode(
		node: CanvasGroupNode,
		baseStyle: string,
		colorClass: string,
		file: PublishFile,
		assets: Asset[],
	): Promise<string> {
		const label = node.label || "";
		let backgroundStyle = "";

		if (node.background) {
			// Resolve the background image path through metadataCache
			const linkedFile = this.metadataCache.getFirstLinkpathDest(
				getLinkpath(node.background),
				file.getPath(),
			);

			if (linkedFile) {
				// Read image and add to assets
				try {
					const imageData = await this.vault.readBinary(linkedFile);
					const imageBase64 = arrayBufferToBase64(imageData);
					const bgPath = `/img/user/${linkedFile.path}`;

					assets.push({
						path: bgPath,
						content: imageBase64,
						localHash: generateBlobHashFromBase64(imageBase64),
					});

					const bgSize =
						node.backgroundStyle === "repeat"
							? "auto"
							: node.backgroundStyle === "ratio"
							? "contain"
							: "cover";

					backgroundStyle = `background-image: url('${encodeURI(
						bgPath,
					)}'); background-size: ${bgSize}; background-repeat: ${
						node.backgroundStyle === "repeat"
							? "repeat"
							: "no-repeat"
					};`;
				} catch (e) {
					console.error("Error reading canvas group background:", e);
				}
			}

			// Fallback if file not found or error
			if (!backgroundStyle) {
				const resolvedPath = linkedFile?.path || node.background;
				const bgPath = encodeURI(`/img/user/${resolvedPath}`);

				const bgSize =
					node.backgroundStyle === "repeat"
						? "auto"
						: node.backgroundStyle === "ratio"
						? "contain"
						: "cover";

				backgroundStyle = `background-image: url('${bgPath}'); background-size: ${bgSize}; background-repeat: ${
					node.backgroundStyle === "repeat" ? "repeat" : "no-repeat"
				};`;
			}
		}

		return `<div class="canvas-node canvas-node-group ${colorClass}" data-node-id="${
			node.id
		}" style="${baseStyle} ${backgroundStyle}">
	${label ? `<div class="canvas-node-label">${this.escapeHtml(label)}</div>` : ""}
</div>`;
	}

	private buildEdgesSvg(edges: CanvasEdge[], nodes: CanvasNode[]): string {
		const nodeMap = new Map(nodes.map((n) => [n.id, n]));

		// Collect unique colors for marker definitions
		const colors = new Set<string>();

		edges.forEach((edge) => {
			colors.add(resolveColor(edge.color) || "var(--text-muted)");
		});

		// Create marker definitions for each color (Obsidian-style arrows)
		const markerDefs = Array.from(colors)
			.map((color) => {
				const colorId = colorToId(color);

				// Obsidian-style arrow: open chevron shape, not filled triangle
				return `<marker id="arrow-${colorId}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
			<path d="M0,0.5 L5,3 L0,5.5" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
		</marker>
		<marker id="arrow-${colorId}-start" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth">
			<path d="M6,0.5 L1,3 L6,5.5" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
		</marker>`;
			})
			.join("\n");

		// Filter for edge label background
		const labelBgFilter = `<filter x="-0.1" y="-0.1" width="1.2" height="1.3" id="edge-label-bg">
			<feFlood flood-color="var(--background-primary)" flood-opacity="1" result="bg"/>
			<feMerge>
				<feMergeNode in="bg"/>
				<feMergeNode in="SourceGraphic"/>
			</feMerge>
		</filter>`;

		const edgeElements = edges
			.map((edge) => {
				const fromNode = nodeMap.get(edge.fromNode);
				const toNode = nodeMap.get(edge.toNode);

				if (!fromNode || !toNode) return "";

				const fromPoint = this.getEdgePoint(
					fromNode,
					edge.fromSide || "right",
				);

				const toPoint = this.getEdgePoint(
					toNode,
					edge.toSide || "left",
				);

				const color = resolveColor(edge.color) || "var(--text-muted)";
				const colorId = colorToId(color);
				const hasArrowFrom = edge.fromEnd === "arrow";
				const hasArrowTo = edge.toEnd !== "none";

				// Create a bezier curve path and get control points for label positioning
				const fromSide = edge.fromSide || "right";
				const toSide = edge.toSide || "left";

				const { path, cp1, cp2 } = this.createBezierPath(
					fromPoint,
					toPoint,
					fromSide,
					toSide,
				);

				// Build marker attributes
				const markerStart = hasArrowFrom
					? `marker-start="url(#arrow-${colorId}-start)"`
					: "";

				const markerEnd = hasArrowTo
					? `marker-end="url(#arrow-${colorId})"`
					: "";

				let edgeHtml = `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" class="canvas-edge" data-edge-id="${edge.id}" ${markerStart} ${markerEnd} />`;

				// Add label at the actual bezier curve midpoint (t=0.5)
				if (edge.label) {
					// Cubic bezier at t=0.5: B(0.5) = (P0 + 3*P1 + 3*P2 + P3) / 8
					const midX =
						(fromPoint.x + 3 * cp1.x + 3 * cp2.x + toPoint.x) / 8;

					const midY =
						(fromPoint.y + 3 * cp1.y + 3 * cp2.y + toPoint.y) / 8;

					edgeHtml += `<text x="${midX}" y="${midY}" class="canvas-edge-label" filter="url(#edge-label-bg)" fill="${color}">${this.escapeHtml(
						edge.label,
					)}</text>`;
				}

				return edgeHtml;
			})
			.join("\n");

		// Return defs + edges
		return `<defs>${markerDefs}${labelBgFilter}</defs>${edgeElements}`;
	}

	private getEdgePoint(
		node: CanvasNode,
		side: "top" | "right" | "bottom" | "left",
	): { x: number; y: number } {
		const centerX = node.x + node.width / 2;
		const centerY = node.y + node.height / 2;

		switch (side) {
			case "top":
				return { x: centerX, y: node.y };
			case "right":
				return { x: node.x + node.width, y: centerY };
			case "bottom":
				return { x: centerX, y: node.y + node.height };
			case "left":
				return { x: node.x, y: centerY };
		}
	}

	private createBezierPath(
		from: { x: number; y: number },
		to: { x: number; y: number },
		fromSide: string,
		toSide: string,
	): {
		path: string;
		cp1: { x: number; y: number };
		cp2: { x: number; y: number };
	} {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Smoother curves like Obsidian - control points extend further out
		// Use a minimum curvature to avoid sharp bends on short edges
		const curvature = Math.max(distance * 0.4, 50);

		let cp1x = from.x,
			cp1y = from.y,
			cp2x = to.x,
			cp2y = to.y;

		// Control points extend perpendicular to the node edge
		switch (fromSide) {
			case "right":
				cp1x += curvature;
				break;
			case "left":
				cp1x -= curvature;
				break;
			case "top":
				cp1y -= curvature;
				break;
			case "bottom":
				cp1y += curvature;
				break;
		}

		switch (toSide) {
			case "right":
				cp2x += curvature;
				break;
			case "left":
				cp2x -= curvature;
				break;
			case "top":
				cp2y -= curvature;
				break;
			case "bottom":
				cp2y += curvature;
				break;
		}

		return {
			path: `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`,
			cp1: { x: cp1x, y: cp1y },
			cp2: { x: cp2x, y: cp2y },
		};
	}

	private resolveFileToGardenUrl(
		filePath: string,
		sourceFile: PublishFile,
	): string {
		const rewriteRules = getRewriteRules(this.settings.pathRewriteRules);

		// Try to find the file in the vault
		const linkedFile = this.metadataCache.getFirstLinkpathDest(
			getLinkpath(filePath),
			sourceFile.getPath(),
		);

		if (!linkedFile) {
			// File not found, return a path that will 404
			const pathWithoutExt = filePath.replace(/\.md$/, "");

			return `/${generateUrlPath(
				pathWithoutExt,
				this.settings.slugifyEnabled,
			)}/`;
		}

		// Check for permalink or home note in frontmatter
		const metadata = this.metadataCache.getCache(linkedFile.path);
		const permalink = metadata?.frontmatter?.["dg-permalink"];
		const isHome = metadata?.frontmatter?.["dg-home"];

		if (isHome) {
			return "/";
		}

		if (permalink) {
			return sanitizePermalink(permalink);
		}

		// Generate garden path
		const gardenPath = getGardenPathForNote(linkedFile.path, rewriteRules);

		return `/${generateUrlPath(gardenPath, this.settings.slugifyEnabled)}/`;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	private renderCanvas(
		canvasId: string,
		nodesHtml: string,
		edgesSvg: string,
	): string {
		return `
<div id="${canvasId}" class="canvas-wrapper hide">
	<svg class="canvas-background">
		<defs>
			<pattern id="canvas-grid-${canvasId}" width="25" height="25" patternUnits="userSpaceOnUse">
				<circle r="1.5" cx="12.5" cy="12.5"></circle>
			</pattern>
		</defs>
		<rect width="100%" height="100%" fill="url(#canvas-grid-${canvasId})"></rect>
	</svg>
	<div class="canvas">
		<svg class="canvas-edges-container" style="position:absolute;width:1px;height:1px;overflow:visible;">
			${edgesSvg}
		</svg>
		${nodesHtml}
	</div>
</div>
`;
	}
}
