import { MetadataCache, Notice, Vault } from "obsidian";
import DigitalGardenSettings from "../models/settings";
import {
	GardenPageCompiler,
	findRelativeHtmlResources,
} from "./GardenPageCompiler";
import { PublishFile } from "../publishFile/PublishFile";

jest.mock("obsidian", () => ({
	parseYaml: jest.fn(),
	stringifyYaml: jest.fn(),
	getLinkpath: (linkpath: string) => linkpath,
	arrayBufferToBase64: () => "PGh0bWw+PC9odG1sPg==",
	Notice: jest.fn(),
}));

const SELF_CONTAINED_HTML =
	"<html><head><style>p{color:red}</style></head><body><p>Hi</p></body></html>";

const getCompiler = ({
	html = SELF_CONTAINED_HTML,
	size = 1000,
	extension = "html",
}: { html?: string; size?: number; extension?: string } = {}) =>
	new GardenPageCompiler(
		{
			readBinary: jest.fn(async () => new ArrayBuffer(8)),
			cachedRead: jest.fn(async () => html),
		} as unknown as Vault,
		{ pathRewriteRules: "" } as DigitalGardenSettings,
		{
			getFirstLinkpathDest: jest.fn((linkpath: string) => ({
				path: `Embeds/${linkpath.split("/").pop()}`,
				name: linkpath.split("/").pop(),
				basename: linkpath.split("/").pop()?.split(".")[0],
				extension,
				stat: { size },
			})),
		} as unknown as MetadataCache,
		jest.fn(),
	);

const publishFile = {
	getPath: () => "Notes/Note.md",
} as PublishFile;

describe("HTML embeds", () => {
	beforeEach(() => {
		jest.mocked(Notice).mockClear();
	});

	describe("convertEmbeddedAssets", () => {
		it("embeds ![[page.html]] as an auto-height iframe and uploads the file", async () => {
			const [text, assets] = await getCompiler().convertEmbeddedAssets(
				publishFile,
			)("![[My Chart.html]]\n");

			expect(text).toContain('<iframe class="html-embed"');
			expect(text).toContain('src="/img/user/Embeds/My%20Chart.html"');
			expect(text).not.toContain("sandbox");
			expect(text).toContain('height="500" onload="');
			expect(text).toContain("new ResizeObserver(fit)");
			expect(text).toContain('title="My Chart"');

			expect(assets).toEqual([
				expect.objectContaining({
					path: "/img/user/Embeds/My Chart.html",
				}),
			]);
		});

		it("supports .htm files", async () => {
			const [text] = await getCompiler({
				extension: "htm",
			}).convertEmbeddedAssets(publishFile)("![[page.htm]]\n");

			expect(text).toContain('src="/img/user/Embeds/page.htm"');
		});

		it("uses a trailing number as the iframe height", async () => {
			const [text] = await getCompiler().convertEmbeddedAssets(
				publishFile,
			)("![[page.html|800]]\n");

			expect(text).toContain('height="800"');
			expect(text).not.toContain("onload");
		});

		it("uses non-numeric metadata as the iframe title", async () => {
			const [text] = await getCompiler().convertEmbeddedAssets(
				publishFile,
			)('![[page.html|Sales "Q3"|300]]\n');

			expect(text).toContain('title="Sales &quot;Q3&quot;"');
			expect(text).toContain('height="300"');
		});

		it("falls back to a wikilink when the file is too large", async () => {
			const [text, assets] = await getCompiler({
				size: 21 * 1024 * 1024,
			}).convertEmbeddedAssets(publishFile)("![[page.html]]\n");

			expect(text).not.toContain("<iframe");
			expect(text).toContain("[[page.html|HTML too large to embed]]");
			expect(assets).toEqual([]);
			expect(Notice).toHaveBeenCalled();
		});

		it("warns when the file references relative resources", async () => {
			const [text] = await getCompiler({
				html: '<link rel="stylesheet" href="style.css"><p>Hi</p>',
			}).convertEmbeddedAssets(publishFile)("![[page.html]]\n");

			expect(text).toContain("<iframe");

			expect(Notice).toHaveBeenCalledWith(
				expect.stringContaining("style.css"),
				expect.anything(),
			);
		});

		it("does not warn for self-contained files", async () => {
			await getCompiler().convertEmbeddedAssets(publishFile)(
				"![[page.html]]\n",
			);

			expect(Notice).not.toHaveBeenCalled();
		});

		it("embeds local ![](page.html) markdown links", async () => {
			const [text, assets] = await getCompiler().convertEmbeddedAssets(
				publishFile,
			)("![Chart](Embeds/page.html)\n");

			expect(text).toContain('src="/img/user/Embeds/page.html"');
			expect(text).toContain('title="Chart"');
			expect(assets).toHaveLength(1);
		});

		it("embeds external ![](https://…/page.html) links without uploading", async () => {
			const [text, assets] = await getCompiler().convertEmbeddedAssets(
				publishFile,
			)("![Demo](https://example.com/demo.html)\n");

			expect(text).toContain('src="https://example.com/demo.html"');
			expect(text).toContain('sandbox="allow-scripts allow-same-origin');
			expect(text).toContain('height="500"');
			expect(text).not.toContain("onload");
			expect(assets).toEqual([]);
		});
	});

	describe("extractImageLinks", () => {
		it("tracks embedded HTML files so they are not deleted as orphans", async () => {
			const compiler = getCompiler();

			(
				compiler as unknown as { metadataCache: MetadataCache }
			).metadataCache.getFileCache = jest.fn(() => ({}));

			const assets = await compiler.extractImageLinks({
				getPath: () => "Notes/Note.md",
				cachedRead: async () =>
					"![[a.html]]\n![b](Embeds/b.htm)\n![c](https://example.com/c.html)\n",
			} as unknown as PublishFile);

			expect(assets).toEqual(["Embeds/a.html", "Embeds/b.htm"]);
		});
	});

	describe("findRelativeHtmlResources", () => {
		it("finds relative src and href attributes", () => {
			expect(
				findRelativeHtmlResources(
					'<script src="./app.js"></script><img src=\'img/a.png\'><link href="/style.css">',
				),
			).toEqual(["./app.js", "img/a.png", "/style.css"]);
		});

		it("ignores absolute, data, anchor and protocol-relative references", () => {
			expect(
				findRelativeHtmlResources(
					'<a href="#top"></a><a href="https://x.com"></a><img src="data:image/png;base64,AA"><script src="//cdn.x.com/a.js"></script><a href="mailto:a@b.c"></a><a href="javascript:void(0)"></a>',
				),
			).toEqual([]);
		});
	});
});
