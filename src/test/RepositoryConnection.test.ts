import { Octokit } from "@octokit/core";
import { PublishPlatform } from "../models/PublishPlatform";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";

jest.mock("@octokit/core", () => ({ Octokit: jest.fn() }));

describe("RepositoryConnection", () => {
	beforeEach(() => {
		jest.mocked(Octokit).mockClear();
	});

	it("configures a GitHub repository from settings", () => {
		const connection = new RepositoryConnection({
			publishPlatform: PublishPlatform.GitHub,
			gitToken: "github-token",
			gitUsername: "owner",
			gitRepo: "garden",
			forestrySettings: {
				forestryPageName: "",
				apiKey: "",
				baseUrl: "",
			},
			notesDirectory: "content/notes",
			assetsDirectory: "public/images",
		});

		expect(connection.getRepositoryName()).toBe("owner/garden");

		expect(Octokit).toHaveBeenCalledWith(
			expect.objectContaining({ auth: "github-token" }),
		);

		expect(connection).toMatchObject({
			noteBase: "content/notes/",
			assetBase: "public/images/",
		});
	});

	it("configures a Forestry repository from settings", () => {
		const connection = new RepositoryConnection({
			publishPlatform: PublishPlatform.ForestryMd,
			gitToken: "",
			gitUsername: "",
			gitRepo: "",
			forestrySettings: {
				forestryPageName: "forestry-garden",
				apiKey: "garden-key",
				baseUrl: "",
			},
			notesDirectory: "ignored/notes",
			assetsDirectory: "ignored/images",
		});

		expect(connection.getRepositoryName()).toBe("Forestry/forestry-garden");

		expect(Octokit).toHaveBeenCalledWith(
			expect.objectContaining({
				auth: "garden-key",
				baseUrl: "https://api.forestry.md/app/Garden",
			}),
		);

		expect(connection).toMatchObject({
			noteBase: "src/site/notes/",
			assetBase: "src/site/img/user/",
		});
	});

	it("creates the public base-garden connection", () => {
		const connection = RepositoryConnection.createBaseGardenConnection();

		expect(connection.getRepositoryName()).toBe("oleeskild/digitalgarden");

		expect(Octokit).toHaveBeenCalledWith(
			expect.objectContaining({ auth: "" }),
		);
	});
});
