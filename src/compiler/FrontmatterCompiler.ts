import { FrontMatterCache } from "obsidian";
import { sanitizePermalink } from "../utils/utils";
import QuartzSyncerSettings from "../models/settings";
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

	constructor(settings: QuartzSyncerSettings) {
		this.settings = settings;
	}

	compile(file: PublishFile, frontmatter: FrontMatterCache): string {
		const fileFrontMatter = { ...frontmatter };
		delete fileFrontMatter["position"];

		let publishedFrontMatter: TPublishedFrontMatter = {
			publish: true,
		};

		publishedFrontMatter = this.addPermalink(file)(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addDefaultPassThrough(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addTimestampsFrontmatter(file)(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addTags(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addCSSClasses(
			fileFrontMatter,
			publishedFrontMatter,
		);

		publishedFrontMatter = this.addSocialImage(
			fileFrontMatter,
			publishedFrontMatter,
		);

		const fullFrontMatter = this.settings.includeAllFrontmatter
			? { ...publishedFrontMatter, ...fileFrontMatter }
			: publishedFrontMatter;

		const frontMatterString = JSON.stringify(fullFrontMatter);

		return `---\n${frontMatterString}\n---\n`;
	}

	/**
	 * Adds the permalink to the compiled frontmatter if specified in user settings
	 */
	private addPermalink =
		(file: PublishFile) =>
		(
			baseFrontMatter: TFrontmatter,
			newFrontMatter: TPublishedFrontMatter,
		) => {
			const publishedFrontMatter = { ...newFrontMatter };

			if (
				!this.settings.usePermalink &&
				!this.settings.includeAllFrontmatter
			) {
				return publishedFrontMatter;
			}

			if (baseFrontMatter) {
				if (baseFrontMatter["permalink"]) {
					publishedFrontMatter["permalink"] =
						baseFrontMatter["permalink"];
				} else if (this.settings.usePermalink) {
					publishedFrontMatter["permalink"] = sanitizePermalink(
						baseFrontMatter["permalink"] ?? file.getVaultPath(),
					);
				}

				if (baseFrontMatter["aliases"] || baseFrontMatter["alias"]) {
					publishedFrontMatter["aliases"] = "";

					if (typeof baseFrontMatter["aliases"] === "string") {
						publishedFrontMatter["aliases"] = baseFrontMatter[
							"aliases"
						]
							.split(/,?\s*/)
							.join(" ");
					}

					if (Array.isArray(baseFrontMatter["aliases"])) {
						publishedFrontMatter["aliases"] =
							baseFrontMatter["aliases"].join(" ");
					}

					if (typeof baseFrontMatter["alias"] === "string") {
						publishedFrontMatter[
							"aliases"
						] += ` ${baseFrontMatter["alias"]}`;
					} else if (Array.isArray(baseFrontMatter["alias"])) {
						publishedFrontMatter["aliases"] += ` ${baseFrontMatter[
							"alias"
						].join(" ")}`;
					}
				}
			}

			return publishedFrontMatter;
		};

	/**
	 * Adds the default pass-throughs to the compiled frontmatter
	 */
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

			if (baseFrontMatter["description"]) {
				publishedFrontMatter["description"] =
					baseFrontMatter["description"];
			}

			if (baseFrontMatter["draft"]) {
				publishedFrontMatter["draft"] = baseFrontMatter["draft"];
			}

			if (baseFrontMatter["comments"]) {
				publishedFrontMatter["comments"] = baseFrontMatter["comments"];
			}

			if (baseFrontMatter["lang"]) {
				publishedFrontMatter["lang"] = baseFrontMatter["lang"];
			}

			if (baseFrontMatter["enableToc"]) {
				publishedFrontMatter["enableToc"] =
					baseFrontMatter["enableToc"];
			}
		}

		return publishedFrontMatter;
	}

	/**
	 * Adds the tags to the compiled frontmatter if specified in user settings
	 */
	private addTags(
		fileFrontMatter: TFrontmatter,
		publishedFrontMatterWithoutTags: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...publishedFrontMatterWithoutTags };

		if (fileFrontMatter) {
			const tags =
				(typeof fileFrontMatter["tags"] === "string"
					? fileFrontMatter["tags"].split(/,?\s*/)
					: fileFrontMatter["tags"]) || [];

			if (tags.length > 0) {
				publishedFrontMatter["tags"] = tags;
			}

			if (fileFrontMatter["tag"] !== undefined) {
				if (typeof fileFrontMatter["tag"] === "string") {
					publishedFrontMatter["tags"] = [
						...(publishedFrontMatter["tags"] ?? []),
						fileFrontMatter["tag"],
					];
				} else if (Array.isArray(fileFrontMatter["tag"])) {
					publishedFrontMatter["tags"] = [
						...(publishedFrontMatter["tags"] ?? []),
						...fileFrontMatter["tag"],
					];
				}
			}
		}

		return publishedFrontMatter;
	}

	/**
	 * Adds the css classes to the compiled frontmatter if specified in user settings
	 */
	private addCSSClasses(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		publishedFrontMatter["cssclasses"] =
			publishedFrontMatter["cssclasses"] ?? "";

		if (baseFrontMatter) {
			if (baseFrontMatter["cssclasses"] !== undefined) {
				if (typeof baseFrontMatter["cssclasses"] === "string") {
					publishedFrontMatter["cssclasses"] +=
						baseFrontMatter["cssclasses"];
				} else if (Array.isArray(baseFrontMatter["cssclasses"])) {
					publishedFrontMatter["cssclasses"] +=
						baseFrontMatter["cssclasses"].join(" ");
				}
			}

			if (baseFrontMatter["cssclass"] !== undefined) {
				if (typeof baseFrontMatter["cssclass"] === "string") {
					publishedFrontMatter["cssclasses"] +=
						baseFrontMatter["cssclass"];
				} else if (Array.isArray(baseFrontMatter["cssclass"])) {
					publishedFrontMatter["cssclasses"] +=
						baseFrontMatter["cssclass"].join(" ");
				}
			}
		}

		// remove duplicates
		if (publishedFrontMatter["cssclasses"]) {
			if (typeof publishedFrontMatter["cssclasses"] === "string") {
				publishedFrontMatter["cssclasses"] =
					publishedFrontMatter["cssclasses"].split(" ");
			}

			if (Array.isArray(publishedFrontMatter["cssclasses"])) {
				publishedFrontMatter["cssclasses"] = [
					...new Set(publishedFrontMatter["cssclasses"]),
				];
			}
		}

		// convert to string
		if (typeof publishedFrontMatter["cssclasses"] !== "string") {
			// If it's an array, join it with spaces
			if (Array.isArray(publishedFrontMatter["cssclasses"])) {
				publishedFrontMatter["cssclasses"] =
					publishedFrontMatter["cssclasses"].join(" ");
			}
		}

		return publishedFrontMatter;
	}

	/**
	 * Adds the social image to the compiled frontmatter if specified in user settings
	 */
	private addSocialImage(
		baseFrontMatter: TFrontmatter,
		newFrontMatter: TPublishedFrontMatter,
	) {
		const publishedFrontMatter = { ...newFrontMatter };

		if (baseFrontMatter) {
			const socialImage =
				baseFrontMatter["socialImage"] ??
				baseFrontMatter["image"] ??
				baseFrontMatter["cover"] ??
				"";

			const socialDescription =
				baseFrontMatter["socialDescription"] ?? "";

			if (socialImage && socialImage !== "") {
				publishedFrontMatter["socialImage"] = socialImage;
			}

			if (socialDescription && socialDescription !== "") {
				publishedFrontMatter["socialDescription"] = socialDescription;
			}
		}

		return publishedFrontMatter;
	}

	/**
	 * Adds the created, updated, and published timestamps to the compiled frontmatter if specified in user settings
	 */
	private addTimestampsFrontmatter =
		(file: PublishFile) =>
		(
			baseFrontMatter: TFrontmatter,
			newFrontMatter: TPublishedFrontMatter,
		) => {
			const {
				showCreatedTimestamp,
				showUpdatedTimestamp,
				showPublishedTimestamp,
			} = this.settings;

			const overridden = this.settings.includeAllFrontmatter;

			const createdAt = file.meta.getCreatedAt();
			const updatedAt = file.meta.getUpdatedAt();
			const publishedAt = file.meta.getPublishedAt();

			if (createdAt && (showCreatedTimestamp || overridden)) {
				newFrontMatter["created"] =
					baseFrontMatter["created"] ??
					baseFrontMatter["date"] ??
					createdAt;
			}

			if (updatedAt && (showUpdatedTimestamp || overridden)) {
				newFrontMatter["modified"] =
					baseFrontMatter["modified"] ??
					baseFrontMatter["lastmod"] ??
					baseFrontMatter["updated"] ??
					baseFrontMatter["last-modified"] ??
					updatedAt;
			}

			if (publishedAt && (showPublishedTimestamp || overridden)) {
				newFrontMatter["published"] =
					baseFrontMatter["published"] ??
					baseFrontMatter["publishDate"] ??
					baseFrontMatter["date"] ??
					updatedAt;
			}

			return newFrontMatter;
		};
}
