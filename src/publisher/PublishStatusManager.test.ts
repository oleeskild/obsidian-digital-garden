import PublishStatusManager from "./PublishStatusManager";
import DigitalGardenSiteManager from "../repositoryConnection/DigitalGardenSiteManager";
import Publisher from "./Publisher";
import { generateBlobHash } from "../utils/utils";
import { CompiledPublishFile } from "../publishFile/PublishFile";

const NOTE_PATH = "06 Assets/Lyrics/Bright Flight.md";
const NOTE_CONTENT = "compiled note content";
const COVER_PATH = "06 Assets/Blog/Album Covers/Bright Flight.jpg";

// Compiled assets carry the CMS prefix (see GardenPageCompiler), while
// remote image hashes are keyed by plain vault path (see getImageHashes).
const COVER_ASSET_PATH = `/img/user/${COVER_PATH}`;

const makeCompiledNote = (
	path: string,
	content: string,
	imagePaths: string[],
) =>
	({
		getPath: () => path,
		compile: async function () {
			return this;
		},
		getCompiledFile: () => [
			content,
			{
				images: imagePaths.map((imagePath) => ({
					path: imagePath,
					content: "",
				})),
			},
		],
		setRemoteHash: () => {},
		missingRemoteAssets: [] as string[],
		setMissingRemoteAssets(
			this: { missingRemoteAssets: string[] },
			paths: string[],
		) {
			this.missingRemoteAssets = paths;
		},
		compare: () => 0,
	}) as unknown as CompiledPublishFile & { compile: () => unknown };

const makeManager = (options: {
	remoteNoteHashes: Record<string, string>;
	remoteImageHashes: Record<string, string>;
	notes: unknown[];
	images?: string[];
}) => {
	const siteManager = {
		getUserGardenConnection: async () => ({
			getContent: async () => ({ tree: [] }),
		}),
		getNoteHashes: async () => options.remoteNoteHashes,
		getImageHashes: async () => options.remoteImageHashes,
	} as unknown as DigitalGardenSiteManager;

	const publisher = {
		setRemoteImageHashes: jest.fn(),
		getFilesMarkedForPublishing: async () => ({
			notes: options.notes,
			images: options.images ?? [],
		}),
	} as unknown as Publisher;

	return new PublishStatusManager(siteManager, publisher);
};

describe("getPublishStatus", () => {
	it("reports each note before compiling it", async () => {
		const compileOrder: string[] = [];

		const notes = ["first.md", "second.md"].map((path) => ({
			...makeCompiledNote(path, NOTE_CONTENT, []),
			compile: async function () {
				compileOrder.push(path);

				return this;
			},
		}));

		const manager = makeManager({
			remoteNoteHashes: {},
			remoteImageHashes: {},
			notes,
		});
		const progress: string[] = [];

		await manager.getPublishStatus((update) => {
			if (update.message.startsWith("Compiling note:")) {
				progress.push(`${update.completed}/${update.total}`);
				compileOrder.push(update.message);
			}
		});

		expect(progress).toEqual(["0/2", "1/2"]);

		expect(compileOrder).toEqual([
			"Compiling note: first.md",
			"first.md",
			"Compiling note: second.md",
			"second.md",
		]);
	});

	it("treats an unchanged note with all images on the remote as published", async () => {
		const note = makeCompiledNote(NOTE_PATH, NOTE_CONTENT, [
			COVER_ASSET_PATH,
		]);

		const manager = makeManager({
			remoteNoteHashes: { [NOTE_PATH]: generateBlobHash(NOTE_CONTENT) },
			remoteImageHashes: { [COVER_PATH]: "some-sha" },
			notes: [note],
			images: [COVER_PATH],
		});

		const status = await manager.getPublishStatus();

		expect(status.publishedNotes.map((f) => f.getPath())).toEqual([
			NOTE_PATH,
		]);
		expect(status.changedNotes).toEqual([]);
	});

	it("treats an unchanged note as changed when a referenced image is missing from the remote", async () => {
		// Regression: notes published before frontmatter covers were
		// uploaded (< 2.80.2) never get their covers published, because
		// the note itself hashes as unchanged and is skipped forever.
		const note = makeCompiledNote(NOTE_PATH, NOTE_CONTENT, [
			COVER_ASSET_PATH,
		]);

		const manager = makeManager({
			remoteNoteHashes: { [NOTE_PATH]: generateBlobHash(NOTE_CONTENT) },
			remoteImageHashes: {},
			notes: [note],
			images: [COVER_PATH],
		});

		const status = await manager.getPublishStatus();

		expect(status.changedNotes.map((f) => f.getPath())).toEqual([
			NOTE_PATH,
		]);

		expect(status.changedNotes[0].missingRemoteAssets).toEqual([
			COVER_ASSET_PATH,
		]);
		expect(status.publishedNotes).toEqual([]);
	});

	it("still treats notes with different content as changed", async () => {
		const note = makeCompiledNote(NOTE_PATH, NOTE_CONTENT, []);

		const manager = makeManager({
			remoteNoteHashes: { [NOTE_PATH]: generateBlobHash("old content") },
			remoteImageHashes: {},
			notes: [note],
		});

		const status = await manager.getPublishStatus();

		expect(status.changedNotes.map((f) => f.getPath())).toEqual([
			NOTE_PATH,
		]);
	});
});
