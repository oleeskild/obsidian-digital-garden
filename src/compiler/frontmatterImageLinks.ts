const FRONTMATTER_IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

/**
 * Extract a resolvable vault linkpath from a frontmatter property value
 * that references an image. Handles plain paths ("attachments/cover.jpg")
 * and wikilinks ("[[cover.jpg]]", "![[cover.jpg|300]]"). Returns null for
 * external URLs and values that don't point at an image.
 */
export function getFrontmatterImageLinkpath(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	let linkpath = value.trim();

	const wikilink = linkpath.match(/^!?\[\[([^\]]+)\]\]$/);

	if (wikilink) {
		linkpath = wikilink[1].split("|")[0].split("#")[0].trim();
	}

	if (linkpath.startsWith("http")) {
		return null;
	}

	if (!FRONTMATTER_IMAGE_EXTENSIONS.test(linkpath)) {
		return null;
	}

	return linkpath;
}

/**
 * Rewrite a frontmatter image value so its linkpath is the file's full
 * vault path, preserving the original shape (wikilink/embed markers,
 * alias and size suffixes, plain paths). Obsidian's default link format
 * is "shortest path when possible" ("[[cover.jpg]]"), which only the
 * vault can resolve — published sites need the full path.
 *
 * resolveLinkpath maps a linkpath to its full vault path, or null when
 * it doesn't resolve; unresolvable values are returned unchanged.
 */
export function resolveFrontmatterImageValue(
	value: unknown,
	resolveLinkpath: (linkpath: string) => string | null,
): unknown {
	const linkpath = getFrontmatterImageLinkpath(value);

	if (!linkpath) {
		return value;
	}

	const resolvedPath = resolveLinkpath(linkpath);

	if (!resolvedPath || resolvedPath === linkpath) {
		return value;
	}

	const trimmed = (value as string).trim();
	const wikilink = trimmed.match(/^(!?)\[\[([^\]]+)\]\]$/);

	if (wikilink) {
		const suffixStart = wikilink[2].search(/[|#]/);
		const suffix = suffixStart === -1 ? "" : wikilink[2].slice(suffixStart);

		return `${wikilink[1]}[[${resolvedPath}${suffix}]]`;
	}

	return resolvedPath;
}
