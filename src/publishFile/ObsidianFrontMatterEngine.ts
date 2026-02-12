import { MetadataCache, TFile, Vault } from "obsidian";

const FRONTMATTER_REGEX = /^\s*?---[\r\n]([\s\S]*?)[\r\n]---/g;

export class ObsidianFrontMatterEngine {
	private generatedFrontMatter: Record<string, unknown> = {};
	private metadataCache: MetadataCache;
	private vault: Vault;
	private file: TFile;

	constructor(
		vault: Vault | null,
		metadataCache: MetadataCache | null,
		file: TFile | null,
	) {
		this.metadataCache = metadataCache as MetadataCache;
		this.vault = vault as Vault;
		this.file = file as TFile;
	}

	set(key: string, value: unknown): this {
		this.generatedFrontMatter[key] = value;

		return this;
	}

	remove(key: string): this {
		this.generatedFrontMatter[key] = undefined;

		return this;
	}

	get(key: string): unknown {
		return this.getFrontMatterSnapshot()[key];
	}

	async apply(): Promise<void> {
		const newFrontMatter = this.getFrontMatterSnapshot();
		const content = await this.vault.cachedRead(this.file);
		const yaml = this.frontMatterToYaml(newFrontMatter);
		let newContent = "";

		if (content.match(FRONTMATTER_REGEX)) {
			newContent = content.replace(FRONTMATTER_REGEX, () => {
				return yaml;
			});
		} else {
			newContent = `${yaml}\n${content}`;
		}
		await this.vault.modify(this.file, newContent);
	}

	private frontMatterToYaml(frontMatter: Record<string, unknown>): string {
		for (const key of Object.keys(frontMatter)) {
			if (frontMatter[key] === undefined) {
				delete frontMatter[key];
			}
		}

		if (Object.keys(frontMatter).length === 0) {
			return "";
		}
		let yaml = "---\n";

		for (const key of Object.keys(frontMatter)) {
			yaml += `${key}: ${frontMatter[key]}\n`;
		}
		yaml += "---";

		return yaml;
	}

	private getFrontMatterSnapshot(): Record<string, unknown> {
		const cachedFrontMatter = {
			...(this.metadataCache.getCache(this.file?.path)?.frontmatter ||
				{}),
		};
		delete cachedFrontMatter["position"];

		return { ...cachedFrontMatter, ...this.generatedFrontMatter };
	}
}
