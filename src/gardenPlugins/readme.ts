/**
 * Pure helpers for showing a community plugin's README in the plugin
 * browser, the way Obsidian's community plugin browser does.
 */

/** raw.githubusercontent.com base for a repo's default branch. */
export function rawRepoBase(repo: string): string {
	return `https://raw.githubusercontent.com/${repo}/HEAD/`;
}

/** Candidate README locations, most common first. */
export function readmeUrls(repo: string): string[] {
	return ["README.md", "readme.md", "Readme.md"].map(
		(name) => `${rawRepoBase(repo)}${name}`,
	);
}

function isRelative(url: string): boolean {
	return !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url.trim());
}

/**
 * Rewrite repo-relative links and images in a README to absolute GitHub
 * URLs, so they resolve outside the repo: images to raw files, links to
 * the GitHub file view. Absolute URLs and anchors are left alone.
 */
export function absolutizeReadmeLinks(markdown: string, repo: string): string {
	const raw = rawRepoBase(repo);
	const blob = `https://github.com/${repo}/blob/HEAD/`;

	const resolve = (base: string, url: string) =>
		`${base}${url.trim().replace(/^\.?\//, "")}`;

	return (
		markdown
			// Markdown images: ![alt](path "title")
			.replace(
				/(!\[[^\]]*\]\()([^)\s]+)/g,
				(match, prefix: string, url: string) =>
					isRelative(url) ? `${prefix}${resolve(raw, url)}` : match,
			)
			// Markdown links: [text](path) — not images, handled above
			.replace(
				/((?:^|[^!])\[[^\]]*\]\()([^)\s]+)/g,
				(match, prefix: string, url: string) =>
					isRelative(url) ? `${prefix}${resolve(blob, url)}` : match,
			)
			// HTML images: <img src="path">
			.replace(
				/(<img\b[^>]*?\bsrc=["'])([^"']+)/gi,
				(match, prefix: string, url: string) =>
					isRelative(url) ? `${prefix}${resolve(raw, url)}` : match,
			)
	);
}
