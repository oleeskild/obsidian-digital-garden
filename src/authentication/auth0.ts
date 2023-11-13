import { Auth0Client } from "@auth0/auth0-spa-js";
export const auth0 = new Auth0Client({
	domain: "dev-digitalforest.eu.auth0.com",
	clientId: "ZOqGEEH2ue60UzJIlJcEEnGTn0jULvEv",
	cacheLocation: "localstorage",
	authorizationParams: {
		redirect_uri: "https://localhost:7035/authorize",
		audience: "https://digitalforest/api",
	},
});
