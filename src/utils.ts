import { Base64 } from "js-base64";
import slugify from "@sindresorhus/slugify";
import sha1 from "crypto-js/sha1";
import { MetadataCache } from "obsidian";

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

function generateUrlPath(filePath: string, slugifyPath = true): string {
	if(!filePath){
		return filePath;
	}
	const extensionLessPath = filePath.substring(0, filePath.lastIndexOf("."));

	if(!slugifyPath){
		return extensionLessPath  + "/";
	}

	return extensionLessPath.split("/").map(x => slugify(x)).join("/") + "/";
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

 const wrapAround = (value: number, size: number): number => {
	return ((value % size) + size) % size;
 };
  
function getRewriteRules(pathRewriteRules: string): Array<Array<string>> {
	return pathRewriteRules.split('\n').map((line: string) => {
		return line.split(':');
	}).filter((rule: string[]) => {
		return rule.length == 2;
	});
} 
	
function getGardenPathForNote(vaultPath: string, rules: Array<Array<string>>): string{
		for (let index = 0; index < rules.length; index++) {
			const rule = rules[index];
			if (vaultPath.startsWith(rule[0])) {
				return rule[1] + vaultPath.slice(rule[0].length)
			}
		}
		return vaultPath;
	}

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function getVaultPathForNote(gardenPath: string, rules: Array<Array<string>>, metadataCache: MetadataCache) {
	for (let index = 0; index < rules.length; index++) {
		const rule = rules[index];
		if (gardenPath.startsWith(rule[1])) {
			const vaultPath = rule[0] + gardenPath.slice(rule[1].length);
			const linkedFile = metadataCache.getCache(vaultPath);
			if (linkedFile) {
				return vaultPath;
			}
		}
	}
	return gardenPath;
}


export { arrayBufferToBase64, extractBaseUrl, generateUrlPath, generateBlobHash, kebabize, wrapAround, getRewriteRules, getVaultPathForNote, getGardenPathForNote, escapeRegExp};
