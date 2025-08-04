import { MetadataCache, TFile, Vault } from "obsidian";
import {
	GardenPageCompiler,
	TCompiledFile,
} from "../compiler/GardenPageCompiler";
import {
	FrontmatterCompiler,
	TFrontmatter,
} from "../compiler/FrontmatterCompiler";
import DigitalGardenSettings from "../models/settings";
import { hasPublishFlag } from "./Validator";
import { FileMetadataManager } from "./FileMetaDataManager";

interface IPublishFileProps {
	file: TFile;
	vault: Vault;
	compiler: GardenPageCompiler;
	metadataCache: MetadataCache;
	settings: DigitalGardenSettings;
}

export class PublishFile {
	file: TFile;
	compiler: GardenPageCompiler;
	vault: Vault;
	compiledFile?: TCompiledFile;
	metadataCache: MetadataCache;
	frontmatter: TFrontmatter;
	settings: DigitalGardenSettings;
	// Access dg-props and other file metadata
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
		return hasPublishFlag(this.frontmatter);
	}

	async getImageLinks() {
		return this.compiler.extractImageLinks(this);
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

	/** Add other possible sorting logic here, eg if we add dg-sortWeight
	 * We might also want to sort by meta.getPath for rewritten garden path
	 */
	compare(other: PublishFile) {
		return this.file.path.localeCompare(other.file.path);
	}

	getPath = () => this.file.path;
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
