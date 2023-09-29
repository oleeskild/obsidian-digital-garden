import { FrontMatterCache, MetadataCache } from "obsidian";
import DigitalGardenSettings from "../models/settings";

// This should soon contain all the magic keys instead of them being hardcoded (with documentation)
export enum FRONTMATTER_KEYS {
	// The file should be published to the garden
	PUBLISH = "dg-publish",
	HOME = "dg-home",
}

export class FileMetadataManager {
	frontmatter: FrontMatterCache;
	metadataCache: MetadataCache;
	settings: DigitalGardenSettings;

	constructor(
		frontmatter: FrontMatterCache,
		metadataCache: MetadataCache,
		settings: DigitalGardenSettings,
	) {
		this.frontmatter = frontmatter;
		this.metadataCache = metadataCache;
		this.settings = settings;
	}

	isHome(): boolean {
		return !!this.frontmatter[FRONTMATTER_KEYS.HOME];
	}
}
