/**
 * Blob Storage Provider Interface
 *
 * This interface defines the contract for blob storage providers.
 * Providers can be used to store images externally instead of in the GitHub repository.
 *
 * Supported providers with generous free tiers:
 * - Cloudflare R2: 10GB storage, 1M reads, 1M writes free/month
 * - Backblaze B2: 10GB storage free forever
 * - AWS S3: 5GB free for 12 months (Free Tier)
 * - Azure Blob Storage: 5GB free for 12 months
 */

export interface BlobUploadResult {
	/** The public URL where the blob can be accessed */
	url: string;
	/** The storage key/path of the uploaded blob */
	key: string;
	/** Optional hash/etag of the uploaded content */
	hash?: string;
}

export interface BlobStorageConfig {
	/** Unique identifier for this provider type */
	type: BlobStorageProviderType;
	/** Whether this storage is enabled */
	enabled: boolean;
}

export interface S3CompatibleConfig extends BlobStorageConfig {
	type: "cloudflare-r2" | "backblaze-b2" | "aws-s3";
	/** S3-compatible endpoint URL */
	endpoint: string;
	/** Access key ID */
	accessKeyId: string;
	/** Secret access key */
	secretAccessKey: string;
	/** Bucket name */
	bucket: string;
	/** Optional custom domain for public URLs */
	publicUrlBase?: string;
	/** Optional path prefix within the bucket */
	pathPrefix?: string;
	/** Region (required for AWS S3, optional for others) */
	region?: string;
}

export interface AzureBlobConfig extends BlobStorageConfig {
	type: "azure-blob";
	/** Azure storage account name */
	accountName: string;
	/** Azure storage account key or SAS token */
	accountKey: string;
	/** Container name */
	container: string;
	/** Optional custom domain for public URLs */
	publicUrlBase?: string;
	/** Optional path prefix within the container */
	pathPrefix?: string;
}

export type BlobStorageProviderConfig = S3CompatibleConfig | AzureBlobConfig;

export type BlobStorageProviderType =
	| "cloudflare-r2"
	| "backblaze-b2"
	| "aws-s3"
	| "azure-blob"
	| "forestry" // Forestry.md managed storage (auto-enabled)
	| "github"; // GitHub is the default, storing in the repo

export interface IBlobStorageProvider {
	/** Provider type identifier */
	readonly type: BlobStorageProviderType;

	/** Human-readable name for display */
	readonly displayName: string;

	/**
	 * Upload a blob to storage.
	 *
	 * @param key - The storage key/path for the blob (e.g., "img/user/photo.png")
	 * @param content - Base64-encoded content
	 * @param contentType - MIME type (e.g., "image/png")
	 * @returns Upload result with public URL
	 */
	upload(
		key: string,
		content: string,
		contentType: string,
	): Promise<BlobUploadResult>;

	/**
	 * Check if a blob exists at the given key.
	 *
	 * @param key - The storage key/path to check
	 * @returns True if the blob exists
	 */
	exists(key: string): Promise<boolean>;

	/**
	 * Get the hash/etag of a blob if it exists.
	 * Used for change detection.
	 *
	 * @param key - The storage key/path
	 * @returns The hash/etag or undefined if not found
	 */
	getHash(key: string): Promise<string | undefined>;

	/**
	 * Delete a blob from storage.
	 *
	 * @param key - The storage key/path to delete
	 * @returns True if deletion was successful
	 */
	delete(key: string): Promise<boolean>;

	/**
	 * Get the public URL for a blob.
	 *
	 * @param key - The storage key/path
	 * @returns The public URL
	 */
	getPublicUrl(key: string): string;

	/**
	 * Test the connection and credentials.
	 *
	 * @returns True if connection is successful
	 */
	testConnection(): Promise<boolean>;
}

/**
 * Get the MIME type for a file based on its extension.
 */
export function getMimeType(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase();

	const mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		bmp: "image/bmp",
		pdf: "application/pdf",
		ico: "image/x-icon",
	};

	return mimeTypes[ext || ""] || "application/octet-stream";
}
