export interface IFriendlyBuildError {
	message: string;
	hint?: string | null;
	affectedNotes?: string[] | null;
}

/**
 * A single build/deploy of the user's garden, as reported by the Forestry API
 * (GET /app/pages/deploys). Statuses: "pending" (queued, waiting for the
 * debounce window), "inprogress", "completed", "failed", "cancelled"
 * (superseded by a newer build).
 */
export interface IDeployInfo {
	runId: string;
	status: string;
	conclusion?: string | null;
	createdAt: string;
	updatedAt?: string | null;
	branch?: string | null;
	durationSeconds?: number | null;
	errorMessage?: string | null;
	friendlyError?: IFriendlyBuildError | null;
}

export interface IDeploysResponse {
	value: IDeployInfo[];
}
