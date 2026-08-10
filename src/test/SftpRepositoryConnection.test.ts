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
});
