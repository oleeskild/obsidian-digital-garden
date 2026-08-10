import { PublishPlatform } from "src/models/PublishPlatform";
import DigitalGardenSettings from "src/models/settings";
import {
	IRepositoryConnection,
	RepositoryConnection,
} from "./RepositoryConnection";
import { ForgejoRepositoryConnection } from "./ForgejoRepositoryConnection";
import { LocalFolderRepositoryConnection } from "./LocalFolderRepositoryConnection";
import { SftpRepositoryConnection } from "./SftpRepositoryConnection";

export default class PublishPlatformConnectionFactory {
	static createBaseGardenConnection(): IRepositoryConnection {
		return RepositoryConnection.createBaseGardenConnection();
	}
	static createPublishPlatformConnection(
		settings: DigitalGardenSettings,
	): IRepositoryConnection {
		if (settings.publishPlatform === PublishPlatform.GitHub) {
			return new RepositoryConnection(settings);
		} else if (settings.publishPlatform === PublishPlatform.Forgejo) {
			return new ForgejoRepositoryConnection(settings);
		} else if (settings.publishPlatform === PublishPlatform.ForestryMd) {
			return new RepositoryConnection(settings);
		} else if (settings.publishPlatform === PublishPlatform.LocalFolder) {
			return new LocalFolderRepositoryConnection(settings);
		} else if (settings.publishPlatform === PublishPlatform.Sftp) {
			return new SftpRepositoryConnection(settings);
		} else {
			throw new Error("Publish platform not supported");
		}
	}
}
