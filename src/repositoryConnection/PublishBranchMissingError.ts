/**
 * Thrown by writes when the configured publish branch does not exist. The
 * plugin never creates it: a missing branch is usually one deleted after a
 * merge, or a typo, and silently recreating it would hide both. The message
 * is written for the user.
 */
export class PublishBranchMissingError extends Error {
	branch: string;

	constructor(branch: string) {
		super(
			`The publish branch "${branch}" does not exist in your repository. It may have been deleted after a merge. Create it on GitHub, or change the publish branch in the plugin settings.`,
		);
		this.name = "PublishBranchMissingError";
		this.branch = branch;
	}
}
