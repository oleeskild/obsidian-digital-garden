import { Notice } from "obsidian";
import { PublishBranchMissingError } from "./PublishBranchMissingError";

export function notifyPublishBranchMissing(
	error: PublishBranchMissingError,
): void {
	new Notice(error.message, 15000);
}
