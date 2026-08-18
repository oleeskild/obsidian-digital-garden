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
		switch (settings.publishPlatform) {
			case PublishPlatform.GitHub:
			case PublishPlatform.ForestryMd:
				return new RepositoryConnection(settings);
			case PublishPlatform.Forgejo:
				return new ForgejoRepositoryConnection(settings);
			case PublishPlatform.LocalFolder:
				return new LocalFolderRepositoryConnection(settings);
			case PublishPlatform.Sftp:
				return new SftpRepositoryConnection(settings);
			default:
				throw new Error("Publish platform not supported");
		}
	}
}
