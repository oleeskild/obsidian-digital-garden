import type { DataAdapter } from "obsidian";

export interface CompilationCacheEntry {
	signature: string;
	compilerFingerprint: string;
	compiledHash: string;
	assetPaths: string[];
}

interface CompilationCache {
	version: 1;
	entries: Record<string, CompilationCacheEntry>;
}

export class CompilationCacheStore {
	private adapter?: DataAdapter;
	private directory?: string;
	private memory: CompilationCache = { version: 1, entries: {} };

	configure(adapter: DataAdapter, pluginDirectory: string): void {
		this.adapter = adapter;
		this.directory = pluginDirectory.replace(/\\/g, "/").replace(/\/$/, "");
	}

	async read(): Promise<Record<string, CompilationCacheEntry>> {
		try {
			const raw = this.adapter
				? await this.adapter.read(this.path())
				: JSON.stringify(this.memory);
			const cache = JSON.parse(raw) as Partial<CompilationCache>;

			if (
				cache.version !== 1 ||
				!cache.entries ||
				typeof cache.entries !== "object" ||
				Array.isArray(cache.entries)
			)
				return {};

			return cache.entries;
		} catch {
			return {};
		}
	}

	async write(entries: Record<string, CompilationCacheEntry>): Promise<void> {
		const sortedEntries = Object.fromEntries(
			Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
		);
		const cache: CompilationCache = { version: 1, entries: sortedEntries };

		if (this.adapter) {
			await this.adapter.write(this.path(), `${JSON.stringify(cache)}\n`);
		} else {
			this.memory = cache;
		}
	}

	private path(): string {
		if (!this.directory)
			throw new Error("Compilation cache store is not configured");

		return `${this.directory}/compilation-cache.json`;
	}
}

export const compilationCacheStore = new CompilationCacheStore();
