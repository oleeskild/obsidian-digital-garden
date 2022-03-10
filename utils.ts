import { Base64 } from "js-base64";
import slugify from "@sindresorhus/slugify";

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
	return url && url.replace("https://", "").replace("http://", "").replace(/\/$/, '')
}

function generateUrlPath(filePath: string): string {
	if(!filePath){
		return filePath;
	}
	const extensionLess = filePath.substring(0, filePath.lastIndexOf("."));
	const noteUrlPath = extensionLess.split("/").map(x => slugify(x)).join("/") + "/";
	return noteUrlPath;
}

export { arrayBufferToBase64, extractBaseUrl, generateUrlPath};