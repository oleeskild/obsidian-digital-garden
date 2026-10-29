import type { Octokit } from "@octokit/core";
import { TFile, type Vault } from "obsidian";
import Logger from "js-logger";
import type DigitalGardenSettings from "../models/settings";
import { sitePath } from "./paths";
import { arrayBufferToBase64 } from "../utils/utils";
import PublishPlatformConnectionFactory from "../repositoryConnection/PublishPlatformConnectionFactory";

// Favicon and logo live as files in the site, not in .env, so they are
// uploaded separately when the site settings are published.

export async function uploadFavicon(
	vault: Vault,
	settings: DigitalGardenSettings,
	octokit: Octokit,
	owner: string,
	repo: string,
	branch: string | undefined,
) {
	let base64SettingsFaviconContent = "";

	if (settings.faviconPath) {
		const faviconFile = vault.getAbstractFileByPath(settings.faviconPath);

		if (!(faviconFile instanceof TFile)) {
			throw new Error(
				`${settings.faviconPath} isn't a file in your vault.`,
			);
		}
		const faviconContent = await vault.readBinary(faviconFile);
		base64SettingsFaviconContent = arrayBufferToBase64(faviconContent);
	} else {
		const baseConnection =
			PublishPlatformConnectionFactory.createBaseGardenConnection(
				PublishPlatformConnectionFactory.githubTokenFor(settings),
			);

		const defaultFavicon = await baseConnection.octoKit.request(
			"GET /repos/{owner}/{repo}/contents/{path}",
			{
				owner: baseConnection.userName,
				repo: baseConnection.pageName,
				path: "src/site/favicon.svg",
			},
		);
		// @ts-expect-error TODO: abstract octokit response
		base64SettingsFaviconContent = defaultFavicon.data.content;
	}

	let faviconExists = true;
	let faviconsAreIdentical = false;
	let currentFaviconOnSite = null;

	try {
		currentFaviconOnSite = await octokit.request(
			"GET /repos/{owner}/{repo}/contents/{path}",
			{
				owner,
				repo,
				path: sitePath(settings, "/favicon.svg"),
				ref: branch,
			},
		);

		// GitHub API returns base64 with newlines, strip them for comparison
		faviconsAreIdentical =
			// @ts-expect-error TODO: abstract octokit response
			currentFaviconOnSite.data.content.replace(/\n/g, "") ===
			base64SettingsFaviconContent;

		if (faviconsAreIdentical) {
			Logger.info("Favicons are identical, skipping update");

			return;
		}
	} catch (error) {
		faviconExists = false;
	}

	if (!faviconExists || !faviconsAreIdentical) {
		await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
			owner,
			repo,
			path: sitePath(settings, "/favicon.svg"),
			branch,
			message: `Update favicon.svg`,
			content: base64SettingsFaviconContent,
			// @ts-expect-error TODO: abstract octokit response
			sha: faviconExists ? currentFaviconOnSite.data.sha : null,
		});
	}
}

export async function uploadLogo(
	vault: Vault,
	settings: DigitalGardenSettings,
	octokit: Octokit,
	owner: string,
	repo: string,
	branch: string | undefined,
) {
	Logger.info(
		`addLogo called, logoPath setting: "${settings.logoPath}", owner: "${owner}", repo: "${repo}"`,
	);
	const logoBasePath = sitePath(settings, "/logo");

	// First, try to delete any existing logo files
	const logoExtensions = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

	for (const ext of logoExtensions) {
		try {
			const existingLogo = await octokit.request(
				"GET /repos/{owner}/{repo}/contents/{path}",
				{
					owner,
					repo,
					path: `${logoBasePath}.${ext}`,
					ref: branch,
				},
			);

			// Delete the existing logo if we're either clearing it or uploading a different format
			if (existingLogo.data) {
				const currentPath = settings.logoPath;

				const currentExt = currentPath
					? currentPath.split(".").pop()?.toLowerCase()
					: null;

				// Delete if no logo path set, or if the extension is different
				if (!currentPath || currentExt !== ext) {
					await octokit.request(
						"DELETE /repos/{owner}/{repo}/contents/{path}",
						{
							owner,
							repo,
							path: `${logoBasePath}.${ext}`,
							branch,
							message: `Remove logo.${ext}`,
							// @ts-expect-error TODO: abstract octokit response
							sha: existingLogo.data.sha,
						},
					);
				}
			}
		} catch {
			// File doesn't exist, continue
		}
	}

	// If no logo path is set, we're done (logo removed)
	if (!settings.logoPath) {
		return;
	}

	const logoFile = vault.getAbstractFileByPath(settings.logoPath);

	if (!(logoFile instanceof TFile)) {
		throw new Error(`${settings.logoPath} isn't a file in your vault.`);
	}

	const logoContent = await vault.readBinary(logoFile);
	const base64LogoContent = arrayBufferToBase64(logoContent);
	const logoExtension = logoFile.extension.toLowerCase();
	const logoPath = `${logoBasePath}.${logoExtension}`;

	Logger.info(`Uploading logo from ${settings.logoPath} to ${logoPath}`);

	let logoExists = true;
	let logosAreIdentical = false;
	let currentLogoOnSite = null;

	try {
		currentLogoOnSite = await octokit.request(
			"GET /repos/{owner}/{repo}/contents/{path}",
			{
				owner,
				repo,
				path: logoPath,
				ref: branch,
			},
		);

		// GitHub API returns base64 with newlines, strip them for comparison
		logosAreIdentical =
			// @ts-expect-error TODO: abstract octokit response
			currentLogoOnSite.data.content.replace(/\n/g, "") ===
			base64LogoContent;

		if (logosAreIdentical) {
			Logger.info("Logos are identical, skipping update");

			return;
		}
	} catch {
		logoExists = false;
	}

	if (!logoExists || !logosAreIdentical) {
		try {
			const requestPayload = {
				owner,
				repo,
				path: logoPath,
				branch,
				message: `Update logo.${logoExtension}`,
				content: base64LogoContent,
				// @ts-expect-error TODO: abstract octokit response
				...(logoExists ? { sha: currentLogoOnSite.data.sha } : {}),
			};

			await octokit.request(
				"PUT /repos/{owner}/{repo}/contents/{path}",
				requestPayload,
			);
		} catch (error) {
			Logger.error("Failed to upload logo", error);

			throw error;
		}
	}
}
