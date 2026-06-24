import { Notice } from "obsidian";
import { LimitReachedError } from "./LimitReachedError";

export function notifyLimitReached(error: LimitReachedError): void {
	if (error.errorType === "build_limit_reached") {
		const used = error.buildsUsed ?? 0;
		const limit = error.monthlyLimit ?? 0;

		new Notice(
			`Publishing blocked: You've used all ${used}/${limit} builds this month. Upgrade to Pro for 1000 builds/month at dashboard.forestry.md/settings`,
			10000,
		);
	} else {
		new Notice(
			`Publishing blocked: Storage limit exceeded. Free up space or upgrade at dashboard.forestry.md/settings`,
			10000,
		);
	}
}
