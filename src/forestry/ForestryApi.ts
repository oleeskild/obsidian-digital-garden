import axios, { AxiosInstance, AxiosResponse } from "axios";
import IPageInfoResponse from "src/models/PageInfo";
import { IUserLimitsResponse } from "src/forestry/UserLimitsResponse";
import { IDeployInfo, IDeploysResponse } from "src/forestry/DeployInfo";
import Logger from "js-logger";

// Default base URL to use as fallback
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export default class ForestryApi {
	client: AxiosInstance;

	constructor(apiKey: string) {
		// Read from environment variable with fallback to default
		const baseUrl =
			process.env.FORESTRY_BASE_URL || DEFAULT_FORESTRY_BASE_URL;

		this.client = axios.create({
			baseURL: baseUrl,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});
	}

	async getPageInfo(): Promise<IPageInfoResponse | null> {
		try {
			const response = (await this.client.get(
				"pages/info",
			)) as AxiosResponse<IPageInfoResponse>;

			if (response.status !== 200) {
				return null;
			}

			return response.data;
		} catch (e) {
			Logger.error(e);

			return null;
		}
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
