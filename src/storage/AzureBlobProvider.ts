/**
 * Azure Blob Storage Provider
 *
 * Supports Azure Blob Storage using Shared Key authentication.
 * Free tier: 5GB storage, 20,000 read operations, 10,000 write operations for 12 months.
 */

import {
	IBlobStorageProvider,
	BlobUploadResult,
	AzureBlobConfig,
	getMimeType,
} from "./IBlobStorageProvider";
import Logger from "js-logger";
import { Base64 } from "js-base64";

const logger = Logger.get("azure-blob-provider");

// Azure Shared Key authentication implementation
async function hmacSha256Base64(
	key: ArrayBuffer,
	message: string,
): Promise<string> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const encoder = new TextEncoder();

	const signature = await crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		encoder.encode(message),
	);

	return Base64.fromUint8Array(new Uint8Array(signature));
}

function getISODate(): string {
	return new Date().toUTCString();
}

export class AzureBlobProvider implements IBlobStorageProvider {
	readonly type = "azure-blob" as const;
	readonly displayName = "Azure Blob Storage";

	private config: AzureBlobConfig;
	private accountKey: ArrayBuffer;

	constructor(config: AzureBlobConfig) {
		this.config = config;

		// Decode the base64 account key
		this.accountKey = Base64.toUint8Array(config.accountKey).buffer;
	}

	private getStorageKey(key: string): string {
		const prefix = this.config.pathPrefix
			? this.config.pathPrefix.replace(/^\/|\/$/g, "") + "/"
			: "";

		const normalizedKey = key.startsWith("/") ? key.slice(1) : key;

		return prefix + normalizedKey;
	}

	private async signRequest(
		method: string,
		path: string,
		headers: Record<string, string>,
		contentLength: number,
	): Promise<string> {
		// Azure Shared Key signature format
		// https://docs.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key

		const canonicalizedHeaders = Object.entries(headers)
			.filter(([k]) => k.toLowerCase().startsWith("x-ms-"))
			.sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
			.map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
			.join("\n");

		const canonicalizedResource = `/${this.config.accountName}/${this.config.container}${path}`;

		const stringToSign = [
			method,
			headers["Content-Encoding"] || "",
			headers["Content-Language"] || "",
			contentLength > 0 ? contentLength.toString() : "",
			headers["Content-MD5"] || "",
			headers["Content-Type"] || "",
			headers["Date"] || "",
			headers["If-Modified-Since"] || "",
			headers["If-Match"] || "",
			headers["If-None-Match"] || "",
			headers["If-Unmodified-Since"] || "",
			headers["Range"] || "",
			canonicalizedHeaders,
			canonicalizedResource,
		].join("\n");

		const signature = await hmacSha256Base64(this.accountKey, stringToSign);

		return `SharedKey ${this.config.accountName}:${signature}`;
	}

	private getBlobUrl(blobPath: string): string {
		return `https://${this.config.accountName}.blob.core.windows.net/${this.config.container}/${blobPath}`;
	}

	async upload(
		key: string,
		content: string,
		contentType?: string,
	): Promise<BlobUploadResult> {
		const storageKey = this.getStorageKey(key);
		const path = `/${encodeURIComponent(storageKey).replace(/%2F/g, "/")}`;

		// Decode base64 content to binary
		const binaryContent = Base64.toUint8Array(content);

		const mimeType = contentType || getMimeType(key);
		const date = getISODate();

		const headers: Record<string, string> = {
			"Content-Type": mimeType,
			"Content-Length": binaryContent.length.toString(),
			"x-ms-blob-type": "BlockBlob",
			"x-ms-date": date,
			"x-ms-version": "2020-10-02",
		};

		const authorization = await this.signRequest(
			"PUT",
			path,
			headers,
			binaryContent.length,
		);

		const url = this.getBlobUrl(storageKey);

		try {
			const response = await fetch(url, {
				method: "PUT",
				headers: {
					...headers,
					Authorization: authorization,
				},
				body: binaryContent,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Azure upload failed: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			// Azure returns Content-MD5 header for the uploaded blob
			const etag = response.headers.get("etag")?.replace(/"/g, "");

			logger.info(`Uploaded ${storageKey} to Azure Blob Storage`);

			return {
				url: this.getPublicUrl(key),
				key: storageKey,
				hash: etag,
			};
		} catch (error) {
			logger.error(`Failed to upload ${storageKey}:`, error);
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		const hash = await this.getHash(key);

		return hash !== undefined;
	}

	async getHash(key: string): Promise<string | undefined> {
		const storageKey = this.getStorageKey(key);
		const path = `/${encodeURIComponent(storageKey).replace(/%2F/g, "/")}`;

		const date = getISODate();

		const headers: Record<string, string> = {
			"x-ms-date": date,
			"x-ms-version": "2020-10-02",
		};

		const authorization = await this.signRequest("HEAD", path, headers, 0);

		const url = this.getBlobUrl(storageKey);

		try {
			const response = await fetch(url, {
				method: "HEAD",
				headers: {
					...headers,
					Authorization: authorization,
				},
			});

			if (response.status === 404) {
				return undefined;
			}

			if (!response.ok) {
				logger.warn(
					`HEAD request failed for ${storageKey}: ${response.status}`,
				);

				return undefined;
			}

			return response.headers.get("etag")?.replace(/"/g, "");
		} catch (error) {
			logger.error(`Failed to get hash for ${storageKey}:`, error);

			return undefined;
		}
	}

	async delete(key: string): Promise<boolean> {
		const storageKey = this.getStorageKey(key);
		const path = `/${encodeURIComponent(storageKey).replace(/%2F/g, "/")}`;

		const date = getISODate();

		const headers: Record<string, string> = {
			"x-ms-date": date,
			"x-ms-version": "2020-10-02",
		};

		const authorization = await this.signRequest(
			"DELETE",
			path,
			headers,
			0,
		);

		const url = this.getBlobUrl(storageKey);

		try {
			const response = await fetch(url, {
				method: "DELETE",
				headers: {
					...headers,
					Authorization: authorization,
				},
			});

			if (!response.ok && response.status !== 404) {
				logger.warn(
					`DELETE request failed for ${storageKey}: ${response.status}`,
				);

				return false;
			}

			logger.info(`Deleted ${storageKey} from Azure Blob Storage`);

			return true;
		} catch (error) {
			logger.error(`Failed to delete ${storageKey}:`, error);

			return false;
		}
	}

	getPublicUrl(key: string): string {
		const storageKey = this.getStorageKey(key);

		if (this.config.publicUrlBase) {
			const base = this.config.publicUrlBase.replace(/\/$/, "");

			return `${base}/${storageKey}`;
		}

		// Default Azure Blob public URL (requires container to be public)
		return this.getBlobUrl(storageKey);
	}

	async testConnection(): Promise<boolean> {
		const date = getISODate();

		const headers: Record<string, string> = {
			"x-ms-date": date,
			"x-ms-version": "2020-10-02",
		};

		// Use a simple list operation to test container access
		const path = "?restype=container&comp=list&maxresults=1";

		const authorization = await this.signRequest(
			"GET",
			`/${path}`,
			headers,
			0,
		);

		const url = `https://${this.config.accountName}.blob.core.windows.net/${this.config.container}${path}`;

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: {
					...headers,
					Authorization: authorization,
				},
			});

			if (response.ok) {
				logger.info(
					`Successfully connected to Azure container: ${this.config.container}`,
				);

				return true;
			}

			logger.warn(
				`Connection test failed: ${response.status} ${response.statusText}`,
			);

			return false;
		} catch (error) {
			logger.error(`Connection test failed:`, error);

			return false;
		}
	}
}
