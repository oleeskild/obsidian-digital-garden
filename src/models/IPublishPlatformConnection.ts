/* eslint-disable @typescript-eslint/no-explicit-any */
import { Octokit } from "@octokit/core";

export interface IPublishPlatformConnection {
	[key: string]: any;
	octoKit?: Octokit;
	userName?: string;
	pageName?: string;
	contentBaseDir?: string;
}
