export type LimitErrorType = "build_limit_reached" | "storage_limit_exceeded";

export class LimitReachedError extends Error {
	errorType: LimitErrorType;
	buildsUsed?: number;
	monthlyLimit?: number;
	starterCreditsRemaining?: number;

	constructor(
		errorType: LimitErrorType,
		responseData: Record<string, unknown>,
	) {
		const message =
			(responseData.message as string) ?? "Usage limit reached";
		super(message);
		this.name = "LimitReachedError";
		this.errorType = errorType;
		this.buildsUsed = responseData.builds_used as number | undefined;
		this.monthlyLimit = responseData.monthly_limit as number | undefined;

		this.starterCreditsRemaining =
			responseData.starter_credits_remaining as number | undefined;
	}
}

export function throwIfLimitError(error: unknown): void {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		(error as { status: number }).status === 403
	) {
		const responseData = extractResponseData(error);

		if (!responseData) return;

		const errorType = responseData.error as string | undefined;

		if (
			errorType === "build_limit_reached" ||
			errorType === "storage_limit_exceeded"
		) {
			throw new LimitReachedError(errorType, responseData);
		}
	}
}

function extractResponseData(error: unknown): Record<string, unknown> | null {
	const err = error as Record<string, unknown>;

	// Octokit RequestError: error.response.data
	if (err.response && typeof err.response === "object") {
		const response = err.response as Record<string, unknown>;

		if (response.data && typeof response.data === "object") {
			return response.data as Record<string, unknown>;
		}
	}

	// Axios error: error.response.data
	if (err.response && typeof err.response === "object") {
		const resp = err.response as Record<string, unknown>;

		if (resp.data && typeof resp.data === "object") {
			return resp.data as Record<string, unknown>;
		}
	}

	return null;
}
