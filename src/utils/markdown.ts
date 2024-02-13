const seperateHashesFromHeader = (
	rawHeading: string,
): { hashes: string; title: string } => {
	const regex = /^(?<hashes>#+)(?<space>\s?)(?<title>.*)$/;
	const matches = rawHeading.match(regex);

	if (matches?.groups) {
		const { hashes, _space, title } = matches.groups;

		return {
			hashes,
			title,
		};
	}

	// always return one hash for valid md heading
	return { hashes: "#", title: rawHeading.trim() };
};

export const fixMarkdownHeaderSyntax = (rawHeading: string): string => {
	const { hashes, title } = seperateHashesFromHeader(rawHeading);

	return `${hashes} ${title}`;
};
