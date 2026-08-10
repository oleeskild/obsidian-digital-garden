import type { DataAdapter } from "obsidian";

export type PublicationTarget = "sftp" | "local";

export interface PublicationManifest {
	version: 1;
	target: string;
	files: Record<string, string>;
}

export class PublicationManifestStore {
	private adapter?: DataAdapter;
	private directory?: string;
	private memory = new Map<PublicationTarget, PublicationManifest>();

	configure(adapter: DataAdapter, pluginDirectory: string): void {
		this.adapter = adapter;
		this.directory = pluginDirectory.replace(/\\/g, "/").replace(/\/$/, "");
	}

	async read(
		kind: PublicationTarget,
		target: string,
	): Promise<PublicationManifest | undefined> {
		try {
			const cached = this.memory.get(kind);

			if (!this.adapter && !cached) return undefined;

			const raw = this.adapter
				? await this.adapter.read(this.path(kind))
				: JSON.stringify(cached);
			const manifest = JSON.parse(raw) as Partial<PublicationManifest>;

			if (
				manifest.version !== 1 ||
				manifest.target !== target ||
				!manifest.files ||
				typeof manifest.files !== "object" ||
				Array.isArray(manifest.files)
			)
				return undefined;

			const files: Record<string, string> = {};

			for (const [filePath, hash] of Object.entries(manifest.files)) {
				if (typeof hash === "string") files[filePath] = hash;
			}

			return { version: 1, target, files };
		} catch {
			return undefined;
		}
	}

	async write(
		kind: PublicationTarget,
		manifest: PublicationManifest,
	): Promise<void> {
		const files = Object.fromEntries(
			Object.entries(manifest.files).sort(([a], [b]) =>
				a.localeCompare(b, undefined, { numeric: true }),
			),
		);
		const normalized = { ...manifest, files };

		if (this.adapter) {
			await this.adapter.write(
				this.path(kind),
				`${JSON.stringify(normalized, null, 2)}\n`,
			);
		} else {
			this.memory.set(kind, normalized);
		}
	}

	async remove(kind: PublicationTarget): Promise<void> {
		this.memory.delete(kind);

		if (this.adapter && (await this.adapter.exists(this.path(kind))))
			await this.adapter.remove(this.path(kind));
	}

	private path(kind: PublicationTarget): string {
		if (!this.directory)
			throw new Error("Publication manifest store is not configured");

		return `${this.directory}/${kind}-manifest.json`;
	}
}

export const publicationManifestStore = new PublicationManifestStore();
