/**
 * In-memory ring buffer of the plugin's recent log output, so users can copy
 * it from a command or button instead of digging through the developer
 * console (which non-developers can't find, and mobile doesn't have at all).
 */

const MAX_LINES = 500;

const lines: string[] = [];
let context = "";

/** Called once on plugin load so exported logs identify the version. */
export function setDebugLogContext(value: string): void {
	context = value;
}

export function appendDebugLogLine(level: string, messages: unknown[]): void {
	const rendered = messages.map(describeValue).join(" ");
	lines.push(`${new Date().toISOString()} [${level}] ${rendered}`);

	if (lines.length > MAX_LINES) {
		lines.splice(0, lines.length - MAX_LINES);
	}
}

export function getDebugLog(): string {
	const header = `Digital Garden plugin ${context} — log copied ${new Date().toISOString()}`;

	if (lines.length === 0) {
		return `${header}\n(no log entries recorded this session)`;
	}

	return `${header}\n${lines.join("\n")}`;
}

/**
 * A one-string description of a thrown value that is safe to show in the UI:
 * the message plus, for HTTP-shaped errors (axios/Octokit), the status code
 * and a snippet of the response body — usually the part that actually says
 * what went wrong.
 */
export function describeError(error: unknown): string {
	if (error instanceof Error) {
		const parts = [error.message];

		const status = extractStatus(error);

		if (status !== null) {
			parts.unshift(`HTTP ${status}`);
		}

		const responseBody = extractResponseBody(error);

		if (responseBody) {
			parts.push(responseBody);
		}

		return parts.join(" — ");
	}

	return describeValue(error);
}

function extractStatus(error: object): number | null {
	const withStatus = error as { status?: unknown; response?: unknown };

	if (typeof withStatus.status === "number") {
		return withStatus.status;
	}

	const response = withStatus.response as { status?: unknown } | undefined;

	if (response && typeof response.status === "number") {
		return response.status;
	}

	return null;
}

function extractResponseBody(error: object): string | null {
	const response = (error as { response?: { data?: unknown } }).response;

	if (!response || response.data === undefined || response.data === null) {
		return null;
	}

	const body =
		typeof response.data === "string"
			? response.data
			: safeStringify(response.data);

	return body.length > 300 ? `${body.slice(0, 300)}…` : body;
}

function describeValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Error) {
		return value.stack ?? `${value.name}: ${value.message}`;
	}

	if (typeof value === "object" && value !== null) {
		return safeStringify(value);
	}

	return String(value);
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
