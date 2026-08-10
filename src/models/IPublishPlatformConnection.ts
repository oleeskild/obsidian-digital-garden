import { Octokit } from "@octokit/core";
import type DigitalGardenSettings from "./settings";

export interface IPublishPlatformConnection {
	octoKit: Octokit;
	userName: string;
	pageName: string;
	notesDirectory?: string;
	assetsDirectory?: string;
	settings?: DigitalGardenSettings;
}
