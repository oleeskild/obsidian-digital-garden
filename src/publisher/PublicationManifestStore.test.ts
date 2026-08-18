import { PublicationManifestStore } from "./PublicationManifestStore";
import type { DataAdapter } from "obsidian";

describe("PublicationManifestStore", () => {
	it("keeps separate manifests per publication kind", async () => {
		const store = new PublicationManifestStore();

		await store.write("sftp", {
			version: 1,
			target: "server-a",
			files: { "notes/a.md": "hash-a" },
		});

		await store.write("local", {
			version: 1,
			target: "folder-a",
			files: { "notes/b.md": "hash-b" },
		});

		expect(await store.read("sftp", "server-a")).toEqual({
			version: 1,
			target: "server-a",
			files: { "notes/a.md": "hash-a" },
		});

		expect(await store.read("local", "folder-a")).toEqual({
			version: 1,
			target: "folder-a",
			files: { "notes/b.md": "hash-b" },
		});
	});

	it("invalidates a manifest when its destination changes", async () => {
		const store = new PublicationManifestStore();

		await store.write("sftp", {
			version: 1,
			target: "server-a",
			files: {},
		});

		expect(await store.read("sftp", "server-b")).toBeUndefined();
	});

	it("uses one file per publication target in the plugin directory", () => {
		const store = new PublicationManifestStore();
		store.configure({} as DataAdapter, ".obsidian/plugins/digitalgarden/");

		const path = (kind: "sftp" | "local") =>
			(
				store as unknown as {
					path(target: "sftp" | "local"): string;
				}
			).path(kind);

		expect(path("sftp")).toBe(
			".obsidian/plugins/digitalgarden/sftp-manifest.json",
		);

		expect(path("local")).toBe(
			".obsidian/plugins/digitalgarden/local-manifest.json",
		);
	});
});
