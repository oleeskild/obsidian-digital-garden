import { describeError, extractStatus } from "../../utils/debugLog";

export type LoadErrorCause = "auth" | "notFound" | "network" | "unknown";

export interface LoadErrorMessage {
	cause: LoadErrorCause;
	title: string;
	body: string;
	/** Raw error for the "Technical details" disclosure. */
	detail: string;
}

const NETWORK_HINTS = [
	"failed to fetch",
	"network",
	"timeout",
	"timed out",
	"enotfound",
	"econnrefused",
	"econnreset",
	"couldn't reach",
];

function classify(error: unknown): LoadErrorCause {
	const status =
		typeof error === "object" && error !== null
			? extractStatus(error)
			: null;

	if (status === 401 || status === 403) return "auth";

	if (status === 404) return "notFound";

	if (status !== null && status >= 500) return "network";

	const message = String(
		error instanceof Error ? error.message : error,
	).toLowerCase();

	if (NETWORK_HINTS.some((hint) => message.includes(hint))) return "network";

	return "unknown";
}

/**
 * Plain-language explanation of why the publication status couldn't load,
 * worded for the hosting track the user is on.
 */
export function describeLoadError(
	error: unknown,
	isForestry: boolean,
): LoadErrorMessage {
	const cause = classify(error);
	const detail = describeError(error);

	switch (cause) {
		case "auth":
			return {
				cause,
				title: "Your garden connection was refused",
				body: isForestry
					? "Forestry.md didn't accept your Garden Key. Reconnect your garden in the plugin settings."
					: "GitHub didn't accept your access token. It may have expired or lost access to the repository. Create a new token and paste it in the plugin settings.",
				detail,
			};
		case "notFound":
			return {
				cause,
				title: "Your garden couldn't be found",
				body: isForestry
					? "Forestry.md couldn't find this garden. Check the connection in the plugin settings."
					: "GitHub couldn't find the repository. Check the username and repository name in the plugin settings.",
				detail,
			};
		case "network":
			return {
				cause,
				title: isForestry
					? "Couldn't reach Forestry.md"
					: "Couldn't reach GitHub",
				body: "Check your internet connection, then try again.",
				detail,
			};
		default:
			return {
				cause,
				title: "Couldn't load what's ready to publish",
				body: "Try again. If it keeps failing, copy the technical details and share them in the Discord.",
				detail,
			};
	}
}
