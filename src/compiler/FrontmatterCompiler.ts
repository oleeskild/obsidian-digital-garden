import { FrontMatterCache } from "obsidian";
import {
	getSyncerPathForNote,
	sanitizePermalink,
	generateUrlPath,
	kebabize,
	getRewriteRules,
} from "../utils/utils";
import QuartzSyncerSettings from "../models/settings";
import { PathRewriteRule } from "../repositoryConnection/QuartzSyncerSiteManager";
import { PublishFile } from "../publishFile/PublishFile";

export type TFrontmatter = Record<string, unknown> & {
	title?: string;
	description?: string;
	aliases?: string;
	permalink?: string;
	draft?: boolean;
	tags?: string;
};

export type TPublishedFrontMatter = Record<string, unknown> & {
	title?: string;
	tags?: string[];
	description?: string;
	aliases?: string;
	permalink?: string;
	draft?: boolean;
};

export class FrontmatterCompiler {
	private readonly settings: QuartzSyncerSettings;
	private readonly rewriteRule: PathRewriteRule;

	constructor(settings: QuartzSyncerSettings) {
		this.settings = settings;
		this.rewriteRule = getRewriteRules(settings.vaultPath);
	}

	compile(file: PublishFile, frontmatter: FrontMatterCache): string {
		const fileFrontMatter = { ...frontmatter };
		delete fileFrontMatter["position"];

		let publishedFrontMatter: TPublishedFrontMatter = {
			publish: true,
		};

		publishedFrontMatter = this.addPermalink(
			fileFrontMatter,
			publishedFrontMatter,
			file.getPath(),
		);

		publishedFrontMatter = this.addDefaultPassThrough(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addContentClasses(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addPageTags(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addFrontMatterSettings(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addNoteIconFrontMatter(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter =
			this.addTimestampsFrontmatter(file)(publishedFrontMatter);

		const fullFrontMatter = publishedFrontMatter?.PassFrontmatter
			? { ...fileFrontMatter, ...publishedFrontMatter }
			: publishedFrontMatter;

		const frontMatterString = JSON.stringify(fullFrontMatter);

		return `---\n${frontMatterString}\n---\n`;
	}

	private addPermalink(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
		filePath: string,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		if (!this.settings.usePermalink) {
			return publishedFrontMatter;
		}

		const quartzPath = getSyncerPathForNote(filePath, this.rewriteRule);

		publishedFrontMatter["path"] = quartzPath;

		if (baseFrontMatter && baseFrontMatter["permalink"]) {
			publishedFrontMatter["permalink"] = baseFrontMatter["permalink"];

			publishedFrontMatter["permalink"] = sanitizePermalink(
				baseFrontMatter["permalink"],
			);
		} else {
			publishedFrontMatter["permalink"] =
				"/" + generateUrlPath(quartzPath, this.settings.slugifyEnabled);
		}

		return publishedFrontMatter;
	}

	private addDefaultPassThrough(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		// Eventually we will add other pass-throughs here. e.g. tags.
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			if (baseFrontMatter["title"]) {
				publishedFrontMatter["title"] = baseFrontMatter["title"];
			}

			if (baseFrontMatter["draft"]) {
				publishedFrontMatter["draft"] = baseFrontMatter["draft"];
			}
		}

		return publishedFrontMatter;
	}

	private addPageTags(
		fileFrontMatter: TFrontmatter,
		publishedFrontMatterWithoutTags: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...publishedFrontMatterWithoutTags };

		if (fileFrontMatter) {
			const tags =
				(typeof fileFrontMatter["tags"] === "string"
					? fileFrontMatter["tags"].split(/,\s*/)
					: fileFrontMatter["tags"]) || [];

			/*if (fileFrontMatter["home"]) {
				tags.push("gardenEntry");
			}*/

			if (tags.length > 0) {
				publishedFrontMatter["tags"] = tags;
			}
		}

		return publishedFrontMatter;
	}

	private addContentClasses(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			const contentClassesKey = this.settings.contentClassesKey;
			const contentClasses = baseFrontMatter[contentClassesKey];

			if (contentClassesKey && contentClasses) {
				if (typeof contentClasses == "string") {
					publishedFrontMatter["contentClasses"] = contentClasses;
				} else if (Array.isArray(contentClasses)) {
					publishedFrontMatter["contentClasses"] =
						contentClasses.join(" ");
				} else {
					publishedFrontMatter["contentClasses"] = "";
				}
			}
		}

		return publishedFrontMatter;
	}

	/**
	 * Adds the created and updated timestamps to the compiled frontmatter if specified in user settings
	 */
	private addTimestampsFrontmatter =
		(file: PublishFile) => (newFrontMatter: TPublishedFrontMatter) => {
			//If all note icon settings are disabled, don't change the frontmatter, so that people won't see all their notes as changed in the publication center
			const { showCreatedTimestamp, showUpdatedTimestamp } =
				this.settings;

			const updatedAt = file.meta.getUpdatedAt();
			const createdAt = file.meta.getCreatedAt();

			if (createdAt && showCreatedTimestamp) {
				newFrontMatter["created"] = createdAt;
			}

			if (updatedAt && showUpdatedTimestamp) {
				newFrontMatter["updated"] = updatedAt;
			}

			return newFrontMatter;
		};

	private addNoteIconFrontMatter(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		if (!baseFrontMatter) {
			baseFrontMatter = {};
		}

		const publishedFrontMatter = { ...newFrontMatter };

		return publishedFrontMatter;
	}

	private addFrontMatterSettings(
		baseFrontMatter: Record<string, unknown>,
		newFrontMatter: Record<string, unknown>,
	) {
		if (!baseFrontMatter) {
			baseFrontMatter = {};
		}
		const publishedFrontMatter = { ...newFrontMatter };

		for (const key of Object.keys(this.settings.defaultNoteSettings)) {
			const settingValue = baseFrontMatter[kebabize(key)];

			if (settingValue) {
				publishedFrontMatter[key] = settingValue;
			}
		}

		const PassFrontmatter =
			this.settings.defaultNoteSettings.PassFrontmatter;

		if (PassFrontmatter) {
			publishedFrontMatter.PassFrontmatter = PassFrontmatter;
		}

		return publishedFrontMatter;
	}
}
