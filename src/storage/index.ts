/**
 * Blob Storage Module
 *
 * This module provides a plugin architecture for external blob storage.
 * Users can store images in cloud storage services instead of GitHub.
 */

export {
	IBlobStorageProvider,
	BlobStorageConfig,
	BlobStorageProviderConfig,
	BlobStorageProviderType,
	S3CompatibleConfig,
	AzureBlobConfig,
	BlobUploadResult,
	getMimeType,
} from "./IBlobStorageProvider";

export { S3CompatibleProvider } from "./S3CompatibleProvider";
export { AzureBlobProvider } from "./AzureBlobProvider";

export {
	createBlobStorageProvider,
	registerProvider,
	getRegisteredProviderTypes,
	getProviderHelpUrl,
	getProviderInfoList,
	validateProviderConfig,
	ProviderInfo,
} from "./BlobStorageFactory";

export {
	buildProviderConfig,
	getProviderFromSettings,
} from "./getProviderFromSettings";

export { ImageUploadService, ImageUploadResult } from "./ImageUploadService";
