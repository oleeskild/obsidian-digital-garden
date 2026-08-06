import { Octokit } from "@octokit/core";

export interface IPublishPlatformConnection {
	octoKit: Octokit;
	userName: string;
	pageName: string;
	notesDirectory?: string;
	assetsDirectory?: string;
}
