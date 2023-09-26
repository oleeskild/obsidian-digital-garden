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
import { isPublishFrontmatterValid } from "./Validator";

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
	}

	async compile(): Promise<CompiledPublishFile> {
		const compiledFile = await this.compiler.generateMarkdown(this.file);

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

	shouldPublish(): boolean {
		return isPublishFrontmatterValid(this.frontmatter);
	}

	async getImageLinks() {
		const content = await this.cachedRead();

		return this.compiler.extractImageLinks(content, this.file.path);
	}

	async cachedRead() {
		return this.vault.cachedRead(this.file);
	}

	getFrontmatter() {
		return this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};
	}

	getPath = () => this.file.path;
	getProcessedFrontmatter() {
		const frontmatterCompiler = new FrontmatterCompiler(this.settings);

		const metadata =
			this.metadataCache.getCache(this.file.path)?.frontmatter ?? {};

		return frontmatterCompiler.getProcessedFrontMatter(this.file, metadata);
	}
}

export class CompiledPublishFile extends PublishFile {
	compiledFile: TCompiledFile;

	constructor(props: IPublishFileProps, compiledFile: TCompiledFile) {
		super(props);

		this.compiledFile = compiledFile;
	}

	getCompiledFile() {
		return this.compiledFile;
	}
}
