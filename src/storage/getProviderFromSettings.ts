/**
 * Helper to build blob storage provider configuration from plugin settings.
 */

import { BlobStorageSettings } from "../models/settings";
import {
	BlobStorageProviderConfig,
	S3CompatibleConfig,
	AzureBlobConfig,
} from "./IBlobStorageProvider";
import { createBlobStorageProvider, IBlobStorageProvider } from "./index";

/**
 * Build a provider configuration from plugin settings.
 */
export function buildProviderConfig(
	settings: BlobStorageSettings | undefined,
): BlobStorageProviderConfig | null {
	if (!settings || !settings.enabled) {
		return null;
	}

	switch (settings.providerType) {
		case "cloudflare-r2":
		case "backblaze-b2":

		// falls through - S3-compatible providers share the same config
		case "aws-s3": {
			if (
				!settings.s3Endpoint ||
				!settings.s3AccessKeyId ||
				!settings.s3SecretAccessKey ||
				!settings.s3Bucket
			) {
				return null;
			}

			const config: S3CompatibleConfig = {
				type: settings.providerType,
				enabled: true,
				endpoint: settings.s3Endpoint,
				accessKeyId: settings.s3AccessKeyId,
				secretAccessKey: settings.s3SecretAccessKey,
				bucket: settings.s3Bucket,
				region: settings.s3Region,
				publicUrlBase: settings.s3PublicUrlBase,
				pathPrefix: settings.s3PathPrefix,
			};

			return config;
		}

		case "azure-blob": {
			if (
				!settings.azureAccountName ||
				!settings.azureAccountKey ||
				!settings.azureContainer
			) {
				return null;
			}

			const config: AzureBlobConfig = {
				type: "azure-blob",
				enabled: true,
				accountName: settings.azureAccountName,
				accountKey: settings.azureAccountKey,
				container: settings.azureContainer,
				publicUrlBase: settings.azurePublicUrlBase,
				pathPrefix: settings.azurePathPrefix,
			};

			return config;
		}

		case "github":
		default:
			return null;
	}
}

/**
 * Create a blob storage provider from plugin settings.
 *
 * @returns Provider instance, or null if using default GitHub storage
 */
export function getProviderFromSettings(
	settings: BlobStorageSettings | undefined,
): IBlobStorageProvider | null {
	const config = buildProviderConfig(settings);

	return createBlobStorageProvider(config);
}
