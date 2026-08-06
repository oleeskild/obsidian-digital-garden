import { PublishPlatform } from "./PublishPlatform";

export enum PublicationProvider {
	Git = "Git",
	LocalFolder = "LocalFolder",
	Forest = "Forest",
}

export enum GitProvider {
	GitHub = "GitHub",
	Forgejo = "Forgejo",
}

export function platformForProvider(
	provider: PublicationProvider,
	gitProvider: GitProvider,
): PublishPlatform {
	if (provider === PublicationProvider.LocalFolder)
		return PublishPlatform.LocalFolder;

	if (provider === PublicationProvider.Forest)
		return PublishPlatform.ForestryMd;

	return gitProvider === GitProvider.Forgejo
		? PublishPlatform.Forgejo
		: PublishPlatform.GitHub;
}

export function providerForPlatform(
	platform: PublishPlatform,
): PublicationProvider {
	if (platform === PublishPlatform.LocalFolder)
		return PublicationProvider.LocalFolder;

	if (platform === PublishPlatform.ForestryMd)
		return PublicationProvider.Forest;

	return PublicationProvider.Git;
}
