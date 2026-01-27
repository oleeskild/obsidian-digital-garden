import { Base64 } from "js-base64";
import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { PathRewriteRules } from "../repositoryConnection/DigitalGardenSiteManager";

const REWRITE_RULE_DELIMITER = ":";

function arrayBufferToBase64(buffer: ArrayBuffer) {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;

	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return Base64.btoa(binary);
}

function extractBaseUrl(url: string) {
	return (
		url &&
		url.replace("https://", "").replace("http://", "").replace(/\/$/, "")
	);
}

function generateUrlPath(filePath: string, slugifyPath = true): string {
	if (!filePath) {
		return filePath;
	}

	// Keep .canvas extension in URLs for canvas files
	const isCanvas = filePath.endsWith(".canvas");

	const extensionLessPath = filePath.contains(".")
		? filePath.substring(0, filePath.lastIndexOf("."))
		: filePath;

	if (!slugifyPath) {
		return extensionLessPath + (isCanvas ? ".canvas/" : "/");
	}

	const slugifiedPath = extensionLessPath
		.split("/")
		.map((x) => slugify(x))
		.join("/");

	return slugifiedPath + (isCanvas ? ".canvas/" : "/");
}

function generateBlobHash(content: string) {
	const byteLength = new TextEncoder().encode(content).byteLength;
	const header = `blob ${byteLength}\0`;
	const gitBlob = header + content;

	return sha1(gitBlob).toString();
}

/**
 * Generate a Git-compatible blob hash for base64-encoded binary content.
 * This is used for images and other binary files.
 */
function generateBase64BlobHash(base64Content: string) {
	// Decode base64 to get the actual binary size
	const binaryString = Base64.atob(base64Content);
	const byteLength = binaryString.length;
	const header = `blob ${byteLength}\0`;

	// For Git blob hash, we need to hash the header + raw binary content
	// crypto-js sha1 works with strings, so we concatenate header + binary string
	const gitBlob = header + binaryString;

	return sha1(gitBlob).toString();
}

function kebabize(str: string) {
	return str
		.split("")
		.map((letter, idx) => {
			return letter.toUpperCase() === letter
				? `${idx !== 0 ? "-" : ""}${letter.toLowerCase()}`
				: letter;
		})
		.join("");
}

const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
};

function getRewriteRules(pathRewriteRules: string): PathRewriteRules {
	return pathRewriteRules
		.split("\n")
		.filter((line: string) => line.includes(REWRITE_RULE_DELIMITER))
		.map((line: string) => {
			const [searchPath, newPath] = line.split(REWRITE_RULE_DELIMITER);

			return { from: searchPath, to: newPath };
		});
}

function getGardenPathForNote(
	vaultPath: string,
	rules: PathRewriteRules,
): string {
	for (const { from, to } of rules) {
		if (vaultPath && vaultPath.startsWith(from)) {
			const newPath = vaultPath.replace(from, to);

			// remote leading slash if to = ""
			if (newPath.startsWith("/")) {
				return newPath.replace("/", "");
			}

			return newPath;
		}
	}

	return vaultPath;
}

function escapeRegExp(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function fixSvgForXmlSerializer(svgElement: SVGSVGElement): void {
	// Insert a comment in the style tags to prevent XMLSerializer from self-closing it during serialization.
	const styles = svgElement.getElementsByTagName("style");

	if (styles.length > 0) {
		for (let i = 0; i < styles.length; i++) {
			const style = styles[i];

			if (!style.textContent?.trim()) {
				style.textContent = "/**/";
			}
		}
	}
}

function sanitizePermalink(permalink: string): string {
	if (!permalink.endsWith("/")) {
		permalink += "/";
	}

	if (!permalink.startsWith("/")) {
		permalink = "/" + permalink;
	}

	return permalink;
}

export {
	arrayBufferToBase64,
	extractBaseUrl,
	generateUrlPath,
	generateBlobHash,
	generateBase64BlobHash,
	kebabize,
	wrapAround,
	getRewriteRules,
	getGardenPathForNote,
	escapeRegExp,
	fixSvgForXmlSerializer,
	sanitizePermalink,
};
