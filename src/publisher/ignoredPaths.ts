/** Normalize a vault-relative path entered in settings. */
export function normalizeIgnoredPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/** Match an exact note/asset path or anything below an ignored folder path. */
export function isPathIgnored(
	path: string,
	ignoredPaths: string[] | undefined,
): boolean {
	const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "");

	return (ignoredPaths ?? []).some((ignoredPath) => {
		const normalizedIgnoredPath = normalizeIgnoredPath(ignoredPath);

		return (
			normalizedIgnoredPath.length > 0 &&
			(normalizedPath === normalizedIgnoredPath ||
				normalizedPath.startsWith(`${normalizedIgnoredPath}/`))
		);
	});
}

/**
 * Test a repository path after removing its configured notes/assets prefix.
 * Paths outside those managed roots are not vault paths and are never ignored.
 */
export function isPublishedPathIgnored(
	repositoryPath: string,
	noteBase: string,
	assetBase: string,
	ignoredPaths: string[] | undefined,
): boolean {
	const normalized = repositoryPath.replace(/\\/g, "/").replace(/^\/+/, "");

	return [noteBase, assetBase].some((base) => {
		const normalizedBase = base
			.replace(/\\/g, "/")
			.replace(/^\/+/, "")
			.replace(/\/+$/, "");

		if (
			normalized !== normalizedBase &&
			!normalized.startsWith(`${normalizedBase}/`)
		)
			return false;

		const vaultPath = normalized.slice(normalizedBase.length + 1);

		return isPathIgnored(vaultPath, ignoredPaths);
	});
}
