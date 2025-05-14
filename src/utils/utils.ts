import { Base64 } from "js-base64";
import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { PathRewriteRule } from "../repositoryConnection/QuartzSyncerSiteManager";
import QuartzSyncerSettings from "src/models/settings";

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

	const extensionLessPath = filePath.contains(".")
		? filePath.substring(0, filePath.lastIndexOf("."))
		: filePath;

	if (!slugifyPath) {
		return extensionLessPath + "/";
	}

	return (
		extensionLessPath
			.split("/")
			.map((x) => slugify(x, { separator: "-", lowercase: false }))
			.join("/") + "/"
	);
}

function generateBlobHash(content: string) {
	const byteLength = new TextEncoder().encode(content).byteLength;
	const header = `blob ${byteLength}\0`;
	const gitBlob = header + content;

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

function getRewriteRules(vaultPath: string): PathRewriteRule {
	return { from: vaultPath, to: "/" };
}

function getSyncerPathForNote(
	vaultPath: string,
	rules: PathRewriteRule,
): string {
	const { from, to } = rules;

	if (vaultPath && vaultPath.startsWith(from)) {
		const newPath = vaultPath.replace(from, to);

		// remote leading slash if to = ""
		if (newPath.startsWith("/")) {
			return newPath.replace("/", "");
		}

		return newPath;
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

function resolvePath(path: string, settings: QuartzSyncerSettings): string {
	if (settings.vaultPath !== "/" && settings.vaultPath !== "") {
		path = path.replace(settings.vaultPath, "");
	}

	return `${settings.contentFolder}/${path}`;
}

export {
	arrayBufferToBase64,
	extractBaseUrl,
	generateUrlPath,
	generateBlobHash,
	kebabize,
	wrapAround,
	getRewriteRules,
	getSyncerPathForNote,
	escapeRegExp,
	fixSvgForXmlSerializer,
	sanitizePermalink,
	resolvePath,
};
