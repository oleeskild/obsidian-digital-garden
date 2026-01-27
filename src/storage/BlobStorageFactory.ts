/**
 * Blob Storage Factory
 *
 * Creates the appropriate blob storage provider based on configuration.
 * Supports a plugin architecture where new providers can be easily added.
 */

import {
	IBlobStorageProvider,
	BlobStorageProviderConfig,
	BlobStorageProviderType,
	S3CompatibleConfig,
	AzureBlobConfig,
} from "./IBlobStorageProvider";
import { S3CompatibleProvider } from "./S3CompatibleProvider";
import { AzureBlobProvider } from "./AzureBlobProvider";
import Logger from "js-logger";

const logger = Logger.get("blob-storage-factory");

/**
 * Registry of available provider factories.
 * New providers can be registered using registerProvider().
 */
const providerFactories: Map<
	BlobStorageProviderType,
	(config: BlobStorageProviderConfig) => IBlobStorageProvider
> = new Map();

// Register built-in providers
providerFactories.set("cloudflare-r2", (config) => {
	return new S3CompatibleProvider(config as S3CompatibleConfig);
});

providerFactories.set("backblaze-b2", (config) => {
	return new S3CompatibleProvider(config as S3CompatibleConfig);
});

providerFactories.set("aws-s3", (config) => {
	return new S3CompatibleProvider(config as S3CompatibleConfig);
});

providerFactories.set("azure-blob", (config) => {
	return new AzureBlobProvider(config as AzureBlobConfig);
});

/**
 * Register a custom provider factory.
 * This allows third-party plugins to add new storage providers.
 */
export function registerProvider(
	type: BlobStorageProviderType,
	factory: (config: BlobStorageProviderConfig) => IBlobStorageProvider,
): void {
	providerFactories.set(type, factory);
	logger.info(`Registered blob storage provider: ${type}`);
}

/**
 * Get all registered provider types.
 */
export function getRegisteredProviderTypes(): BlobStorageProviderType[] {
	return Array.from(providerFactories.keys());
}

/**
 * Create a blob storage provider based on configuration.
 *
 * @param config - Provider configuration
 * @returns The configured provider, or null if type is 'github' (use default)
 */
export function createBlobStorageProvider(
	config: BlobStorageProviderConfig | null,
): IBlobStorageProvider | null {
	if (!config || config.type === "github" || !config.enabled) {
		// Use default GitHub storage
		return null;
	}

	const factory = providerFactories.get(config.type);

	if (!factory) {
		logger.warn(`Unknown blob storage provider type: ${config.type}`);

		return null;
	}

	try {
		return factory(config);
	} catch (error) {
		logger.error(`Failed to create provider ${config.type}:`, error);

		return null;
	}
}

/**
 * Get provider-specific help/documentation URLs.
 */
export function getProviderHelpUrl(type: BlobStorageProviderType): string {
	switch (type) {
		case "cloudflare-r2":
			return "https://developers.cloudflare.com/r2/";
		case "backblaze-b2":
			return "https://www.backblaze.com/docs/cloud-storage";
		case "aws-s3":
			return "https://docs.aws.amazon.com/s3/";
		case "azure-blob":
			return "https://docs.microsoft.com/en-us/azure/storage/blobs/";
		default:
			return "";
	}
}

/**
 * Get provider display information for the settings UI.
 */
export interface ProviderInfo {
	type: BlobStorageProviderType;
	displayName: string;
	description: string;
	freeTier: string;
	helpUrl: string;
}

export function getProviderInfoList(): ProviderInfo[] {
	return [
		{
			type: "github",
			displayName: "GitHub (Default)",
			description: "Store images in your GitHub repository",
			freeTier: "Included with repository",
			helpUrl: "",
		},
		{
			type: "cloudflare-r2",
			displayName: "Cloudflare R2",
			description: "S3-compatible object storage with zero egress fees",
			freeTier: "10GB storage, 1M reads, 1M writes/month free",
			helpUrl: "https://developers.cloudflare.com/r2/",
		},
		{
			type: "backblaze-b2",
			displayName: "Backblaze B2",
			description: "Affordable S3-compatible cloud storage",
			freeTier: "10GB storage free forever",
			helpUrl: "https://www.backblaze.com/docs/cloud-storage",
		},
		{
			type: "aws-s3",
			displayName: "Amazon S3",
			description: "Industry-standard object storage from AWS",
			freeTier: "5GB storage free for 12 months",
			helpUrl: "https://docs.aws.amazon.com/s3/",
		},
		{
			type: "azure-blob",
			displayName: "Azure Blob Storage",
			description: "Microsoft's cloud object storage",
			freeTier: "5GB storage free for 12 months",
			helpUrl: "https://docs.microsoft.com/en-us/azure/storage/blobs/",
		},
	];
}

/**
 * Validate provider configuration.
 * Returns an array of error messages, empty if valid.
 */
export function validateProviderConfig(
	config: BlobStorageProviderConfig,
): string[] {
	const errors: string[] = [];

	if (!config.type) {
		errors.push("Provider type is required");

		return errors;
	}

	switch (config.type) {
		case "cloudflare-r2":
		case "backblaze-b2":

		// falls through - S3-compatible providers share validation
		case "aws-s3": {
			const s3Config = config as S3CompatibleConfig;

			if (!s3Config.endpoint) {
				errors.push("Endpoint URL is required");
			} else {
				try {
					new URL(s3Config.endpoint);
				} catch {
					errors.push("Endpoint must be a valid URL");
				}
			}

			if (!s3Config.accessKeyId) {
				errors.push("Access Key ID is required");
			}

			if (!s3Config.secretAccessKey) {
				errors.push("Secret Access Key is required");
			}

			if (!s3Config.bucket) {
				errors.push("Bucket name is required");
			}

			if (config.type === "aws-s3" && !s3Config.region) {
				errors.push("Region is required for AWS S3");
			}
			break;
		}

		case "azure-blob": {
			const azureConfig = config as AzureBlobConfig;

			if (!azureConfig.accountName) {
				errors.push("Storage account name is required");
			}

			if (!azureConfig.accountKey) {
				errors.push("Account key is required");
			}

			if (!azureConfig.container) {
				errors.push("Container name is required");
			}
			break;
		}

		case "github":
			// No validation needed for GitHub
			break;

		default:
			errors.push(`Unknown provider type: ${config.type}`);
	}

	return errors;
}
