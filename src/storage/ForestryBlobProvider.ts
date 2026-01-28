/**
 * Forestry.md Blob Storage Provider
 *
 * Automatically handles image uploads for Forestry.md users.
 * Images are stored on the Forestry.md backend and served via CDN.
 * No user configuration required - uses the existing Forestry API key.
 */

import {
	IBlobStorageProvider,
	BlobUploadResult,
	getMimeType,
} from "./IBlobStorageProvider";
import Logger from "js-logger";

const logger = Logger.get("forestry-blob-provider");

// Default base URL - can be overridden via environment
const DEFAULT_FORESTRY_BASE_URL = "https://api.forestry.md/app";

export interface ForestryBlobConfig {
	apiKey: string;
	baseUrl?: string;
}

export class ForestryBlobProvider implements IBlobStorageProvider {
	readonly type = "forestry" as const;
	readonly displayName = "Forestry.md Assets";

	private apiKey: string;
	private baseUrl: string;

	constructor(config: ForestryBlobConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || DEFAULT_FORESTRY_BASE_URL;
	}

	private getHeaders(): Record<string, string> {
		return {
			Authorization: `Bearer ${this.apiKey}`,
			"Content-Type": "application/json",
		};
	}

	async upload(
		key: string,
		content: string,
		contentType?: string,
	): Promise<BlobUploadResult> {
		const mimeType = contentType || getMimeType(key);

		try {
			const response = await fetch(`${this.baseUrl}/assets/upload`, {
				method: "POST",
				headers: this.getHeaders(),
				body: JSON.stringify({
					path: key,
					content,
					contentType: mimeType,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Forestry upload failed: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			const result = (await response.json()) as {
				url: string;
				hash?: string;
			};

			logger.info(`Uploaded ${key} to Forestry.md`);

			return {
				url: result.url,
				key,
				hash: result.hash,
			};
		} catch (error) {
			logger.error(`Failed to upload ${key} to Forestry.md:`, error);
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		const hash = await this.getHash(key);

		return hash !== undefined;
	}

	async getHash(key: string): Promise<string | undefined> {
		try {
			const response = await fetch(
				`${this.baseUrl}/assets/info?path=${encodeURIComponent(key)}`,
				{
					method: "GET",
					headers: this.getHeaders(),
				},
			);

			if (response.status === 404) {
				return undefined;
			}

			if (!response.ok) {
				logger.warn(
					`Failed to get hash for ${key}: ${response.status}`,
				);

				return undefined;
			}

			const result = (await response.json()) as { hash?: string };

			return result.hash;
		} catch (error) {
			logger.error(`Failed to get hash for ${key}:`, error);

			return undefined;
		}
	}

	async delete(key: string): Promise<boolean> {
		try {
			const response = await fetch(
				`${this.baseUrl}/assets?path=${encodeURIComponent(key)}`,
				{
					method: "DELETE",
					headers: this.getHeaders(),
				},
			);

			if (!response.ok && response.status !== 404) {
				logger.warn(`Failed to delete ${key}: ${response.status}`);

				return false;
			}

			logger.info(`Deleted ${key} from Forestry.md`);

			return true;
		} catch (error) {
			logger.error(`Failed to delete ${key}:`, error);

			return false;
		}
	}

	getPublicUrl(key: string): string {
		// The URL is returned by the upload endpoint
		// This is a fallback pattern - actual URLs come from upload response
		return `${this.baseUrl}/assets/serve?path=${encodeURIComponent(key)}`;
	}

	async testConnection(): Promise<boolean> {
		try {
			// Use a lightweight endpoint to verify credentials
			const response = await fetch(`${this.baseUrl}/assets/status`, {
				method: "GET",
				headers: this.getHeaders(),
			});

			if (response.ok) {
				logger.info("Successfully connected to Forestry.md assets API");

				return true;
			}

			logger.warn(
				`Forestry.md connection test failed: ${response.status}`,
			);

			return false;
		} catch (error) {
			logger.error("Forestry.md connection test failed:", error);

			return false;
		}
	}
}
