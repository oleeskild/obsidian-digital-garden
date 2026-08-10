import {
	PublicationProvider,
	platformForProvider,
	providerForPlatform,
	GitProvider,
} from "../models/PublicationProvider";
import { PublishPlatform } from "../models/PublishPlatform";
import DigitalGardenSettings from "../models/settings";
import { SftpRepositoryConnection } from "../repositoryConnection/SftpRepositoryConnection";

describe("SFTP publication provider", () => {
	it("maps between provider and platform", () => {
		expect(
			platformForProvider(PublicationProvider.Sftp, GitProvider.GitHub),
		).toBe(PublishPlatform.Sftp);

		expect(providerForPlatform(PublishPlatform.Sftp)).toBe(
			PublicationProvider.Sftp,
		);
	});

	it("keeps repository paths inside the configured remote root", () => {
		const connection = new SftpRepositoryConnection({
			sftpRemoteRoot: "/srv/garden",
		} as DigitalGardenSettings);

		const resolve = (value: string) =>
			(
				connection as unknown as { resolve(path: string): string }
			).resolve(value);

		expect(resolve("src/site/notes/Hello.md")).toBe(
			"/srv/garden/src/site/notes/Hello.md",
		);

		expect(() => resolve("../../etc/passwd")).toThrow(
			"Path escapes SFTP garden folder",
		);
	});

	it("normalizes cross-runtime binary data returned by SFTP", () => {
		const connection = new SftpRepositoryConnection({
			sftpRemoteRoot: "/garden",
		} as DigitalGardenSettings);

		const toBuffer = (
			connection as unknown as {
				toBuffer(content: unknown, path: string): Buffer;
			}
		).toBuffer.bind(connection);

		expect(toBuffer(new Uint8Array([65, 66, 67]), "note").toString()).toBe(
			"ABC",
		);
		expect(toBuffer("text", "note").toString()).toBe("text");
		expect(toBuffer([], "empty-note")).toEqual(Buffer.alloc(0));
	});

	it("converts managed hashes between manifests and repository trees", () => {
		const connection = new SftpRepositoryConnection({
			sftpRemoteRoot: "/garden",
			notesDirectory: "content/notes",
			assetsDirectory: "content/assets",
		} as DigitalGardenSettings);

		const internals = connection as unknown as {
			treeToManifest(
				tree: {
					path?: string;
					sha?: string;
					type?: string;
				}[],
			): { version: 1; files: Record<string, string> };
			manifestToTree(manifest: {
				version: 1;
				files: Record<string, string>;
			}): { tree: { path?: string; sha?: string }[] };
		};

		const manifest = internals.treeToManifest([
			{ path: "content/notes/a.md", sha: "note", type: "blob" },
			{ path: "content/assets/a.png", sha: "asset", type: "blob" },
			{ path: "unmanaged.txt", sha: "ignored", type: "blob" },
		]);

		expect(manifest.files).toEqual({
			"content/notes/a.md": "note",
			"content/assets/a.png": "asset",
		});

		expect(internals.manifestToTree(manifest).tree).toEqual([
			{ path: "content/assets/a.png", sha: "asset", type: "blob" },
			{ path: "content/notes/a.md", sha: "note", type: "blob" },
		]);
	});
});
