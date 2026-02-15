export interface IUserLimitsResponse {
	plan: string;
	builds: {
		monthlyRemaining: number;
		monthlyLimit: number;
		starterCreditsRemaining: number;
		nextReset: string | null;
	};
	storage: {
		usedBytes: number;
		limitBytes: number;
		usedFormatted: string;
		limitFormatted: string;
	};
	sites: {
		current: number;
		limit: number;
	};
	features: {
		customDomain: boolean;
		drafts: boolean;
		brandingRemoval: boolean;
	};
}
