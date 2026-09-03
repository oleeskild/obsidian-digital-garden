import axios, { AxiosInstance, AxiosResponse } from "axios";
import IPageInfoResponse from "src/models/PageInfo";
import { IUserLimitsResponse } from "src/forestry/UserLimitsResponse";
import { IDeployInfo, IDeploysResponse } from "src/forestry/DeployInfo";
import Logger from "js-logger";

// Default base URL to use as fallback
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export function getForestryBaseUrl(): string {
	// Read from environment variable with fallback to default
	return process.env.FORESTRY_BASE_URL || DEFAULT_FORESTRY_BASE_URL;
}

/**
 * Why a Forestry request failed, at the granularity the UI cares about:
 * - "unauthorized": the server answered and rejected the credentials/code
 *   (401/403/404). Retrying with the same input won't help.
 * - "unreachable": no usable answer (offline, DNS, timeout, 5xx). The
 *   input may be fine; the user should try again.
 */
export type ForestryFailureKind = "unauthorized" | "unreachable";

export class ForestryApiError extends Error {
	kind: ForestryFailureKind;
	status: number | null;

	constructor(kind: ForestryFailureKind, message: string, status?: number) {
		super(message);
		this.name = "ForestryApiError";
		this.kind = kind;
		this.status = status ?? null;
	}
}

export type ForestryResult<T> =
	| { ok: true; value: T }
	| { ok: false; kind: ForestryFailureKind; message: string };

/**
 * What the dashboard hands the plugin in exchange for a one-time connect
 * code (POST /app/connect/exchange).
 */
export interface IConnectExchangeResponse {
	value: {
		apiKey: string;
		pageName: string;
		baseUrl: string;
	};
}

function classifyError(e: unknown): ForestryApiError {
	if (axios.isAxiosError(e)) {
		const status = e.response?.status;

		if (status && status >= 400 && status < 500) {
			const serverMessage =
				typeof e.response?.data?.errorMessage === "string"
					? e.response.data.errorMessage
					: null;

			return new ForestryApiError(
				"unauthorized",
				serverMessage ?? `Forestry.md rejected the request (${status})`,
				status,
			);
		}

		return new ForestryApiError(
			"unreachable",
			status
				? `Forestry.md returned an error (${status})`
				: "Couldn't reach Forestry.md",
			status,
		);
	}

	return new ForestryApiError(
		"unreachable",
		e instanceof Error ? e.message : "Couldn't reach Forestry.md",
	);
}

export default class ForestryApi {
	client: AxiosInstance;

	constructor(apiKey: string) {
		this.client = axios.create({
			baseURL: getForestryBaseUrl(),
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});
	}

	/**
	 * Redeem a one-time connect code minted by the dashboard for the garden's
	 * key. Needs no credentials; the code is the credential. Throws a
	 * {@link ForestryApiError} so callers can tell "expired/invalid code"
	 * from "offline".
	 */
	static async exchangeConnectCode(
		code: string,
	): Promise<IConnectExchangeResponse["value"]> {
		try {
			const response = (await axios.post(
				`${getForestryBaseUrl()}/connect/exchange`,
				{ code },
				{ headers: { "Content-Type": "application/json" } },
			)) as AxiosResponse<IConnectExchangeResponse>;

			const value = response.data?.value;

			if (!value?.apiKey || !value.pageName) {
				throw new ForestryApiError(
					"unreachable",
					"Forestry.md returned an unexpected response",
					response.status,
				);
			}

			return value;
		} catch (e) {
			if (e instanceof ForestryApiError) throw e;
			Logger.error(e);
			throw classifyError(e);
		}
	}

	/**
	 * Like {@link getPageInfo}, but says why it failed instead of returning
	 * null, so connect UIs can distinguish a wrong key from being offline.
	 */
	async getPageInfoResult(): Promise<ForestryResult<IPageInfoResponse>> {
		try {
			const response = (await this.client.get(
				"pages/info",
			)) as AxiosResponse<IPageInfoResponse>;

			if (response.status !== 200 || !response.data?.value) {
				return {
					ok: false,
					kind: "unreachable",
					message: `Unexpected response (${response.status})`,
				};
			}

			return { ok: true, value: response.data };
		} catch (e) {
			Logger.error(e);
			const error = classifyError(e);

			return { ok: false, kind: error.kind, message: error.message };
		}
	}

	async getPageInfo(): Promise<IPageInfoResponse | null> {
		const result = await this.getPageInfoResult();

		return result.ok ? result.value : null;
	}

	async getDeploys(
		branch: "active" | "main" = "active",
		limit = 10,
	): Promise<IDeployInfo[] | null> {
		try {
			const response = (await this.client.get("pages/deploys", {
				params: { branch, limit },
			})) as AxiosResponse<IDeploysResponse>;

			if (response.status !== 200) {
				return null;
			}

			return response.data.value;
		} catch (e) {
			Logger.error(e);

			return null;
		}
	}

	async getUserLimits(): Promise<IUserLimitsResponse | null> {
		try {
			const response = (await this.client.get(
				"user/limits",
			)) as AxiosResponse<IUserLimitsResponse>;

			if (response.status !== 200) {
				return null;
			}

			return response.data;
		} catch (e) {
			Logger.error(e);

			return null;
		}
	}
}
