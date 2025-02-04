import axios, { AxiosInstance, AxiosResponse } from "axios";
import IPageInfoResponse from "src/models/PageInfo";
import Logger from "js-logger";
export default class ForestryApi {
	client: AxiosInstance;

	constructor(apiKey: string) {
		const baseUrl = "https://wa-forestry-prod-api.azurewebsites.net/app"; //TODO: Get from .env

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
}
