/**
 * Image Upload Service
 *
 * Coordinates image uploads between GitHub and external blob storage.
 * When blob storage is configured, images are uploaded there and URLs are rewritten.
 */

import { Asset } from "../compiler/GardenPageCompiler";
import DigitalGardenSettings from "../models/settings";
import { IBlobStorageProvider, getMimeType } from "./IBlobStorageProvider";
import { getProviderFromSettings } from "./getProviderFromSettings";
import Logger from "js-logger";

const logger = Logger.get("image-upload-service");

export interface ImageUploadResult {
	/** The asset with potentially updated path for blob storage */
	asset: Asset;
	/** Whether the image was uploaded to blob storage */
	usedBlobStorage: boolean;
	/** The public URL if using blob storage */
	blobUrl?: string;
}

export class ImageUploadService {
	private provider: IBlobStorageProvider | null;
	private settings: DigitalGardenSettings;

	constructor(settings: DigitalGardenSettings) {
		this.settings = settings;
		this.provider = getProviderFromSettings(settings.blobStorage);

		if (this.provider) {
			logger.info(
				`Using blob storage provider: ${this.provider.displayName}`,
			);
		}
	}

	/**
	 * Check if blob storage is enabled and configured.
	 */
	isBlobStorageEnabled(): boolean {
		return this.provider !== null;
	}

	/**
	 * Get the configured provider, if any.
	 */
	getProvider(): IBlobStorageProvider | null {
		return this.provider;
	}

	/**
	 * Upload an image to blob storage.
	 *
	 * @param asset - The asset to upload
	 * @returns Upload result with status
	 */
	async uploadToBlobStorage(asset: Asset): Promise<ImageUploadResult> {
		if (!this.provider) {
			return {
				asset,
				usedBlobStorage: false,
			};
		}

		// Convert asset path to storage key
		// Asset paths are like "/img/user/path/to/image.png"
		// Storage keys should be like "img/user/path/to/image.png"
		const storageKey = asset.path.startsWith("/")
			? asset.path.slice(1)
			: asset.path;

		try {
			// Check if we need to upload (compare hashes)
			const remoteHash = await this.provider.getHash(storageKey);

			if (remoteHash && asset.localHash === remoteHash) {
				logger.info(`Skipping unchanged image: ${storageKey}`);

				return {
					asset: {
						...asset,
						remoteHash,
					},
					usedBlobStorage: true,
					blobUrl: this.provider.getPublicUrl(storageKey),
				};
			}

			// Upload the image
			const contentType = getMimeType(storageKey);

			const result = await this.provider.upload(
				storageKey,
				asset.content,
				contentType,
			);

			logger.info(`Uploaded to blob storage: ${storageKey}`);

			return {
				asset: {
					...asset,
					remoteHash: result.hash,
				},
				usedBlobStorage: true,
				blobUrl: result.url,
			};
		} catch (error) {
			logger.error(
				`Failed to upload ${storageKey} to blob storage:`,
				error,
			);

			// Fall back to GitHub storage
			return {
				asset,
				usedBlobStorage: false,
			};
		}
	}

	/**
	 * Upload multiple images to blob storage.
	 *
	 * @param assets - The assets to upload
	 * @returns Map of asset path to blob URL for rewriting
	 */
	async uploadAllToBlobStorage(
		assets: Asset[],
	): Promise<Map<string, string>> {
		const urlMap = new Map<string, string>();

		if (!this.provider) {
			return urlMap;
		}

		// Upload in parallel with concurrency limit
		const concurrency = 5;
		const results: ImageUploadResult[] = [];

		for (let i = 0; i < assets.length; i += concurrency) {
			const batch = assets.slice(i, i + concurrency);

			const batchResults = await Promise.all(
				batch.map((asset) => this.uploadToBlobStorage(asset)),
			);
			results.push(...batchResults);
		}

		// Build URL map for successful uploads
		for (const result of results) {
			if (result.usedBlobStorage && result.blobUrl) {
				urlMap.set(result.asset.path, result.blobUrl);
			}
		}

		logger.info(
			`Uploaded ${urlMap.size} of ${assets.length} images to blob storage`,
		);

		return urlMap;
	}

	/**
	 * Rewrite image paths in content to use blob storage URLs.
	 *
	 * @param content - The compiled markdown content
	 * @param urlMap - Map of original paths to blob URLs
	 * @returns Content with rewritten URLs
	 */
	rewriteImageUrls(content: string, urlMap: Map<string, string>): string {
		let rewrittenContent = content;

		for (const [originalPath, blobUrl] of urlMap) {
			// Escape special regex characters in the path
			const escapedPath = originalPath.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&",
			);

			// Replace all occurrences of the path
			// This handles both markdown image syntax and HTML img tags
			const regex = new RegExp(escapedPath, "g");
			rewrittenContent = rewrittenContent.replace(regex, blobUrl);
		}

		return rewrittenContent;
	}

	/**
	 * Delete an image from blob storage.
	 *
	 * @param path - The image path to delete
	 */
	async deleteFromBlobStorage(path: string): Promise<boolean> {
		if (!this.provider) {
			return false;
		}

		const storageKey = path.startsWith("/") ? path.slice(1) : path;

		return await this.provider.delete(storageKey);
	}

	/**
	 * Test the blob storage connection.
	 */
	async testConnection(): Promise<boolean> {
		if (!this.provider) {
			return false;
		}

		return await this.provider.testConnection();
	}
}
