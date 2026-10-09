import { Octokit } from "@octokit/core";

export interface IPublishPlatformConnection {
	octoKit: Octokit;
	userName: string;
	pageName: string;
	contentBaseDir?: string;
	/** Branch to read from and write to instead of the default branch. */
	branch?: string;
}
