import type { App, TFile } from "obsidian";
import { FRONTMATTER_KEYS } from "./FileMetaDataManager";

type HomePageApp = Pick<App, "vault" | "metadataCache">;

/**
 * Every markdown note in the vault flagged as the garden home page
 * (`dg-home: true`). Normally zero or one; more than one is a build error.
 */
export function findHomePageFiles(app: HomePageApp): TFile[] {
	const homePages: TFile[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);

		if (cache?.frontmatter?.[FRONTMATTER_KEYS.HOME]) {
			homePages.push(file);
		}
	}

	return homePages;
}

export function hasHomePage(app: HomePageApp): boolean {
	return findHomePageFiles(app).length > 0;
}
