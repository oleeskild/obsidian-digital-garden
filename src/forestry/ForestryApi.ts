import axios from "axios";
import { auth0 } from "src/authentication/auth0";
export default class ForestryApi {
	baseUrl = "https://localhost:7035";

	async createPage(pageName: string): Promise<boolean> {
		const response = await axios.post(
			this.baseUrl + `/Pages/${pageName}`,
			{},
			{
				headers: {
					Authorization: `Bearer ${await auth0.getTokenSilently()}`,
				},
			},
		);

		if (response.status === 200) {
			return true;
		}

		return false;
	}
}
