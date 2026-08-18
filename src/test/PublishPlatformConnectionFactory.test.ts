import { PublishPlatform } from "../models/PublishPlatform";
import DigitalGardenSettings from "../models/settings";
import { ForgejoRepositoryConnection } from "../repositoryConnection/ForgejoRepositoryConnection";
import { LocalFolderRepositoryConnection } from "../repositoryConnection/LocalFolderRepositoryConnection";
import PublishPlatformConnectionFactory from "../repositoryConnection/PublishPlatformConnectionFactory";
import { RepositoryConnection } from "../repositoryConnection/RepositoryConnection";
import { SftpRepositoryConnection } from "../repositoryConnection/SftpRepositoryConnection";

const settings = (publishPlatform: PublishPlatform) =>
	({
		publishPlatform,
		gitToken: "token",
		gitUsername: "owner",
		gitRepo: "garden",
		forgejoApiUrl: "https://forgejo.example/api/v1",
		forestrySettings: {
			forestryPageName: "forestry-garden",
			apiKey: "garden-key",
			baseUrl: "",
		},
	}) as DigitalGardenSettings;

describe("PublishPlatformConnectionFactory", () => {
	it.each([
		[PublishPlatform.GitHub, RepositoryConnection],
		[PublishPlatform.ForestryMd, RepositoryConnection],
		[PublishPlatform.Forgejo, ForgejoRepositoryConnection],
		[PublishPlatform.LocalFolder, LocalFolderRepositoryConnection],
		[PublishPlatform.Sftp, SftpRepositoryConnection],
	])("creates the %s connection", (platform, Connection) => {
		expect(
			PublishPlatformConnectionFactory.createPublishPlatformConnection(
				settings(platform),
			),
		).toBeInstanceOf(Connection);
	});
});
