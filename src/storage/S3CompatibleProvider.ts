/**
 * S3-Compatible Blob Storage Provider
 *
 * Works with any S3-compatible storage service:
 * - Cloudflare R2
 * - Backblaze B2
 * - AWS S3
 * - MinIO
 * - DigitalOcean Spaces
 * - etc.
 *
 * Uses native fetch with AWS Signature V4 signing.
 */

import {
	IBlobStorageProvider,
	BlobUploadResult,
	S3CompatibleConfig,
	BlobStorageProviderType,
	getMimeType,
} from "./IBlobStorageProvider";
import Logger from "js-logger";
import { Base64 } from "js-base64";

const logger = Logger.get("s3-compatible-provider");

// AWS Signature V4 implementation
async function sha256(message: string): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();
	const data = encoder.encode(message);

	return await crypto.subtle.digest("SHA-256", data);
}

async function sha256Bytes(data: ArrayBuffer): Promise<ArrayBuffer> {
	return await crypto.subtle.digest("SHA-256", data);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function hmacSha256(
	key: ArrayBuffer,
	message: string,
): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const encoder = new TextEncoder();

	return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function getSignatureKey(
	secretKey: string,
	dateStamp: string,
	region: string,
	service: string,
): Promise<ArrayBuffer> {
	const encoder = new TextEncoder();

	const kDate = await hmacSha256(
		encoder.encode("AWS4" + secretKey),
		dateStamp,
	);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);

	return await hmacSha256(kService, "aws4_request");
}

function getAmzDate(): { amzDate: string; dateStamp: string } {
	const now = new Date();
	const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
	const dateStamp = amzDate.substring(0, 8);

	return { amzDate, dateStamp };
}

export class S3CompatibleProvider implements IBlobStorageProvider {
	readonly type: BlobStorageProviderType;
	readonly displayName: string;

	private config: S3CompatibleConfig;
	private host: string;
	private region: string;

	constructor(config: S3CompatibleConfig) {
		this.config = config;
		this.type = config.type;

		// Set display name based on provider type
		switch (config.type) {
			case "cloudflare-r2":
				this.displayName = "Cloudflare R2";
				break;
			case "backblaze-b2":
				this.displayName = "Backblaze B2";
				break;
			case "aws-s3":
				this.displayName = "Amazon S3";
				break;
			default:
				this.displayName = "S3 Compatible Storage";
		}

		// Parse host from endpoint
		const endpointUrl = new URL(config.endpoint);
		this.host = endpointUrl.host;

		// Set region - default to 'auto' for R2, 'us-east-1' for others
		this.region =
			config.region ||
			(config.type === "cloudflare-r2" ? "auto" : "us-east-1");
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
		payload: ArrayBuffer | string,
	): Promise<Record<string, string>> {
		const { amzDate, dateStamp } = getAmzDate();

		// Calculate payload hash
		const payloadBuffer =
			typeof payload === "string"
				? new TextEncoder().encode(payload)
				: payload;

		const payloadHash = toHex(await sha256Bytes(payloadBuffer));

		// Build canonical headers
		const signedHeaders: Record<string, string> = {
			host: this.host,
			"x-amz-content-sha256": payloadHash,
			"x-amz-date": amzDate,
			...headers,
		};

		const sortedHeaderKeys = Object.keys(signedHeaders).sort();

		const canonicalHeaders = sortedHeaderKeys
			.map((k) => `${k.toLowerCase()}:${signedHeaders[k].trim()}`)
			.join("\n");

		const signedHeadersString = sortedHeaderKeys
			.map((k) => k.toLowerCase())
			.join(";");

		// Build canonical request
		const canonicalRequest = [
			method,
			path,
			"", // query string (empty for basic operations)
			canonicalHeaders + "\n",
			signedHeadersString,
			payloadHash,
		].join("\n");

		// Build string to sign
		const algorithm = "AWS4-HMAC-SHA256";
		const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

		const stringToSign = [
			algorithm,
			amzDate,
			credentialScope,
			toHex(await sha256(canonicalRequest)),
		].join("\n");

		// Calculate signature
		const signingKey = await getSignatureKey(
			this.config.secretAccessKey,
			dateStamp,
			this.region,
			"s3",
		);

		const signature = toHex(await hmacSha256(signingKey, stringToSign));

		// Build authorization header
		const authorization = `${algorithm} Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersString}, Signature=${signature}`;

		return {
			...signedHeaders,
			Authorization: authorization,
		};
	}

	async upload(
		key: string,
		content: string,
		contentType?: string,
	): Promise<BlobUploadResult> {
		const storageKey = this.getStorageKey(key);

		const path = `/${this.config.bucket}/${encodeURIComponent(
			storageKey,
		).replace(/%2F/g, "/")}`;

		// Decode base64 content to binary
		const binaryContent = Base64.toUint8Array(content);

		const mimeType = contentType || getMimeType(key);

		const headers: Record<string, string> = {
			"Content-Type": mimeType,
			"Content-Length": binaryContent.length.toString(),
		};

		const signedHeaders = await this.signRequest(
			"PUT",
			path,
			headers,
			binaryContent,
		);

		const url = `${this.config.endpoint}/${this.config.bucket}/${storageKey}`;

		try {
			const response = await fetch(url, {
				method: "PUT",
				headers: signedHeaders,
				body: binaryContent,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`S3 upload failed: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}

			const etag = response.headers.get("etag")?.replace(/"/g, "");

			logger.info(`Uploaded ${storageKey} to ${this.displayName}`);

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

		const path = `/${this.config.bucket}/${encodeURIComponent(
			storageKey,
		).replace(/%2F/g, "/")}`;

		const signedHeaders = await this.signRequest("HEAD", path, {}, "");

		const url = `${this.config.endpoint}/${this.config.bucket}/${storageKey}`;

		try {
			const response = await fetch(url, {
				method: "HEAD",
				headers: signedHeaders,
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

		const path = `/${this.config.bucket}/${encodeURIComponent(
			storageKey,
		).replace(/%2F/g, "/")}`;

		const signedHeaders = await this.signRequest("DELETE", path, {}, "");

		const url = `${this.config.endpoint}/${this.config.bucket}/${storageKey}`;

		try {
			const response = await fetch(url, {
				method: "DELETE",
				headers: signedHeaders,
			});

			if (!response.ok && response.status !== 404) {
				logger.warn(
					`DELETE request failed for ${storageKey}: ${response.status}`,
				);

				return false;
			}

			logger.info(`Deleted ${storageKey} from ${this.displayName}`);

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

		// Default public URL format
		switch (this.config.type) {
			case "cloudflare-r2":
				// R2 requires a custom domain or R2.dev subdomain for public access
				return `${this.config.endpoint}/${this.config.bucket}/${storageKey}`;
			case "backblaze-b2":
				// B2 friendly URL format
				return `https://f000.backblazeb2.com/file/${this.config.bucket}/${storageKey}`;
			case "aws-s3":
				// S3 public URL format
				return `https://${this.config.bucket}.s3.${this.region}.amazonaws.com/${storageKey}`;
			default:
				return `${this.config.endpoint}/${this.config.bucket}/${storageKey}`;
		}
	}

	async testConnection(): Promise<boolean> {
		const path = `/${this.config.bucket}`;

		const signedHeaders = await this.signRequest("HEAD", path, {}, "");

		const url = `${this.config.endpoint}/${this.config.bucket}`;

		try {
			const response = await fetch(url, {
				method: "HEAD",
				headers: signedHeaders,
			});

			// 200 = bucket exists and we have access
			// 404 = bucket doesn't exist
			// 403 = access denied
			if (response.ok) {
				logger.info(
					`Successfully connected to ${this.displayName} bucket: ${this.config.bucket}`,
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
