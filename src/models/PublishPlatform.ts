/* eslint-disable @typescript-eslint/no-duplicate-enum-values */
export enum PublishPlatform {
	/** Uses the legacy serialized value so existing installations migrate transparently. */
	GitHub = "SelfHosted",
	SelfHosted = "SelfHosted",
	Forgejo = "Forgejo",
	Sftp = "Sftp",
	LocalFolder = "LocalFolder",
	ForestryMd = "ForestryMd",
}
