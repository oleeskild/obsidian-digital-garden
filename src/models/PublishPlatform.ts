export enum PublishPlatform {
	/** Uses the legacy serialized value so existing installations migrate transparently. */
	GitHub = "SelfHosted",
	Forgejo = "Forgejo",
	LocalFolder = "LocalFolder",
	ForestryMd = "ForestryMd",
}
