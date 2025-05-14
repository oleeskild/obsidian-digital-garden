import { MetadataCache, TFile, Vault } from "obsidian";
import {
	SyncerPageCompiler,
	TCompiledFile,
} from "../compiler/SyncerPageCompiler";
import {
	FrontmatterCompiler,
	TFrontmatter,
} from "../compiler/FrontmatterCompiler";
import QuartzSyncerSettings from "../models/settings";
import { hasPublishFlag } from "./Validator";
import { FileMetadataManager } from "./FileMetaDataManager";

interface IPublishFileProps {
	file: TFile;
	vault: Vault;
	compiler: SyncerPageCompiler;
	metadataCache: MetadataCache;
	settings: QuartzSyncerSettings;
}

export class PublishFile {
	file: TFile;
	compiler: SyncerPageCompiler;
	vault: Vault;
	compiledFile?: TCompiledFile;
	metadataCache: MetadataCache;
	frontmatter: TFrontmatter;
	settings: QuartzSyncerSettings;
	// Access props and other file metadata
	meta: FileMetadataManager;

	constructor({
		file,
		compiler,
		metadataCache,
		vault,
		settings,
	}: IPublishFileProps) {
		this.compiler = compiler;
		this.metadataCache = metadataCache;
		this.file = file;
		this.settings = settings;
		this.vault = vault;
		this.frontmatter = this.getFrontmatter();

		this.meta = new FileMetadataManager(file, this.frontmatter, settings);
	}

	async compile(): Promise<CompiledPublishFile> {
		const compiledFile = await this.compiler.generateMarkdown(this);

		return new CompiledPublishFile(
			{
				file: this.file,
				compiler: this.compiler,
				metadataCache: this.metadataCache,
				vault: this.vault,
				settings: this.settings,
			},
			compiledFile,
		);
	}

	// TODO: This doesn't work yet, but file should be able to tell it's type
	getType(): "excalidraw" | "markdown" {
		if (this.file.name.endsWith(".excalidraw")) {
			return "excalidraw";
		}

		return "markdown";
	}

	shouldPublish(): boolean {
		return hasPublishFlag(
			this.settings.publishFrontmatterKey,
			this.frontmatter,
		);
	}

	async getBlobLinks() {
		return this.compiler.extractBlobLinks(this);
	}

	async cachedRead() {
		return this.vault.cachedRead(this.file);
	}

	getMetadata() {
		return this.metadataCache.getCache(this.file.path) ?? {};
	}

	getBlock(blockId: string) {
		return this.getMetadata().blocks?.[blockId];
	}

	getFrontmatter() {
		return this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};
	}

	/** Add other possible sorting logic here, eg if we add sortWeight
	 * We might also want to sort by meta.getPath for rewritten garden path
	 */
	compare(other: PublishFile) {
		return this.file.path.localeCompare(other.file.path);
	}

	getPath = () => this.file.path;
	getVaultPath = () => {
		if (
			this.settings.vaultPath !== "/" &&
			this.file.path.startsWith(this.settings.vaultPath)
		) {
			return this.file.path.replace(this.settings.vaultPath, "");
		}

		return this.file.path;
	};
	getCompiledFrontmatter() {
		const frontmatterCompiler = new FrontmatterCompiler(this.settings);

		const metadata =
			this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};

		return frontmatterCompiler.compile(this, metadata);
	}
}

export class CompiledPublishFile extends PublishFile {
	compiledFile: TCompiledFile;
	remoteHash?: string;

	constructor(props: IPublishFileProps, compiledFile: TCompiledFile) {
		super(props);

		this.compiledFile = compiledFile;
	}

	getCompiledFile() {
		return this.compiledFile;
	}

	setRemoteHash(hash: string) {
		this.remoteHash = hash;
	}
}
