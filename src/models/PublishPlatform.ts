export enum PublishPlatform {
	/** Uses the legacy serialized value so existing installations migrate transparently. */
	GitHub = "SelfHosted",
	Forgejo = "Forgejo",
	Sftp = "Sftp",
	LocalFolder = "LocalFolder",
	ForestryMd = "ForestryMd",
}
