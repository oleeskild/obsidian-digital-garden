import { Octokit } from "@octokit/core";

export interface IPublishPlatformConnection {
	octoKit: Octokit;
	userName: string;
	pageName: string;
}
