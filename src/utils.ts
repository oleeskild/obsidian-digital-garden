import { Base64 } from "js-base64";
import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";

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

function generateBlobHash(content: string){
	const byteLength = (new TextEncoder().encode(content)).byteLength;
	const header = `blob ${byteLength}\0`;
	const gitBlob = header + content;

	return sha1(gitBlob).toString();
}

function kebabize(str: string){ 
	return str.split('').map((letter, idx) => {
	  return letter.toUpperCase() === letter
	   ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}`
	   : letter;
	}).join('');
 }

export { arrayBufferToBase64, extractBaseUrl, generateUrlPath, generateBlobHash, kebabize};