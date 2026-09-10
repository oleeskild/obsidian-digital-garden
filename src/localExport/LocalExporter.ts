import { Notice, Platform, TFile, Vault } from "obsidian";
// Type-only: the real modules are loaded on demand in export(). A top-level
// import would make the whole plugin require Node builtins at load time,
// which Obsidian mobile rejects ("Attempting to load NodeJS package").
import type * as FsPromises from "fs/promises";
import type * as Path from "path";
import Logger from "js-logger";
import DigitalGardenSettings from "../models/settings";
import Publisher from "../publisher/Publisher";
import {
	NOTE_PATH_BASE,
	IMAGE_PATH_BASE,
	normalizeContentBaseDir,
} from "../publisher/paths";
import { generateEnvValues, serializeEnvValues } from "../utils/envSettings";

const PRESERVED_FILES = new Set(["notes.json", "notes.11tydata.js"]);
const IMG_USER_PREFIX = "/img/user/";

export class LocalExporter {
	private settings: DigitalGardenSettings;
	private vault: Vault;
	private publisher: Publisher;
	private fs!: typeof FsPromises;
	private path!: typeof Path;

	constructor(
		vault: Vault,
		publisher: Publisher,
		settings: DigitalGardenSettings,
	) {
		this.vault = vault;
		this.publisher = publisher;
		this.settings = settings;
	}

	async export(): Promise<{ notes: number; images: number; failed: number }> {
		await this.loadNodeModules();
		const targetPath = this.settings.localExportPath;

		if (!targetPath) {
			new Notice(
				"Set a local garden folder path in plugin settings first.",
			);
			throw new Error("localExportPath is not configured");
		}

		const base = normalizeContentBaseDir(this.settings.contentBaseDir);

		await this.validateTargetPath(targetPath);
		await this.writeEnvFile(targetPath);
		await this.writeNavigationOrder(targetPath);

		try {
			await this.copyFromVault(
				this.settings.faviconPath,
				this.path.join(targetPath, base, "src", "site"),
				"favicon.svg",
			);
		} catch (e) {
			Logger.warn("Failed to copy favicon", e);
		}

		try {
			await this.copyFromVault(
				this.settings.logoPath,
				this.path.join(targetPath, base, "src", "site"),
				"logo",
			);
		} catch (e) {
			Logger.warn("Failed to copy logo", e);
		}

		const marked = await this.publisher.getFilesMarkedForPublishing();

		const notesDir = this.path.join(targetPath, base, NOTE_PATH_BASE);
		const imagesDir = this.path.join(targetPath, base, IMAGE_PATH_BASE);

		await this.fs.mkdir(notesDir, { recursive: true });
		await this.fs.mkdir(imagesDir, { recursive: true });

		const writtenNotePaths = new Set<string>();
		const writtenImagePaths = new Set<string>();

		let notesWritten = 0;
		let imagesWritten = 0;
		let failed = 0;

		// Compile and write each note
		for (const file of marked.notes) {
			try {
				const [content, assets] =
					await this.publisher.compiler.generateMarkdown(file);

				const notePath = this.path.join(notesDir, file.getPath());

				await this.fs.mkdir(this.path.dirname(notePath), {
					recursive: true,
				});
				await this.fs.writeFile(notePath, content, "utf-8");
				writtenNotePaths.add(file.getPath());
				notesWritten++;

				// Write assets from this note
				for (const image of assets.images) {
					const imagePath = this.path.join(
						targetPath,
						base,
						"src",
						"site",
						image.path,
					);

					await this.fs.mkdir(this.path.dirname(imagePath), {
						recursive: true,
					});

					const buffer = Buffer.from(image.content, "base64");
					await this.fs.writeFile(imagePath, buffer);

					// Normalize to path relative to imagesDir
					const relativeImagePath = image.path.startsWith(
						IMG_USER_PREFIX,
					)
						? image.path.slice(IMG_USER_PREFIX.length)
						: image.path;
					writtenImagePaths.add(relativeImagePath);
					imagesWritten++;
				}
			} catch (e) {
				Logger.error(`Failed to export ${file.getPath()}`, e);
				failed++;
			}
		}

		// Write standalone images (referenced in notes but not returned as assets)
		for (const imagePath of marked.images) {
			if (writtenImagePaths.has(imagePath)) {
				continue;
			}

			try {
				const imageFile = this.vault.getAbstractFileByPath(imagePath);

				if (!(imageFile instanceof TFile)) {
					Logger.warn(`Image not found in vault: ${imagePath}`);
					continue;
				}

				const binary = await this.vault.readBinary(imageFile);
				const destPath = this.path.join(imagesDir, imagePath);

				await this.fs.mkdir(this.path.dirname(destPath), {
					recursive: true,
				});
				await this.fs.writeFile(destPath, Buffer.from(binary));
				writtenImagePaths.add(imagePath);
				imagesWritten++;
			} catch (e) {
				Logger.error(`Failed to export image ${imagePath}`, e);
			}
		}

		// Clean stale files
		await this.cleanStaleFiles(notesDir, writtenNotePaths, PRESERVED_FILES);
		await this.cleanStaleFiles(imagesDir, writtenImagePaths, new Set());

		return { notes: notesWritten, images: imagesWritten, failed };
	}

	private async loadNodeModules(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice("Local export is only available on desktop.");
			throw new Error("Local export requires the desktop app");
		}

		// Plain require() here (not a static import) so the builtins are only
		// touched when an export actually runs. Obsidian loads plugins as
		// CommonJS, so require is available on desktop.
		/* eslint-disable @typescript-eslint/no-var-requires -- intentional lazy load */
		this.fs = require("fs/promises") as typeof FsPromises;
		this.path = require("path") as typeof Path;
		/* eslint-enable @typescript-eslint/no-var-requires */
	}

	private async validateTargetPath(targetPath: string): Promise<void> {
		const base = normalizeContentBaseDir(this.settings.contentBaseDir);

		try {
			await this.fs.access(targetPath);
		} catch {
			new Notice(`Local garden folder not found: ${targetPath}`);
			throw new Error(`Target path does not exist: ${targetPath}`);
		}

		const expectedSiteDir = this.path.join(targetPath, base, "src", "site");

		try {
			await this.fs.access(expectedSiteDir);
		} catch {
			const expectedRelative = base ? `${base}src/site/` : "src/site/";

			new Notice(
				`Folder doesn't look like a digital garden — expected ${expectedRelative} directory at ` +
					targetPath,
			);
			throw new Error(
				`Target path missing ${expectedRelative} directory: ${targetPath}`,
			);
		}
	}

	private async writeEnvFile(targetPath: string): Promise<void> {
		const base = normalizeContentBaseDir(this.settings.contentBaseDir);
		const envValues = generateEnvValues(this.settings);
		const envContent = serializeEnvValues(envValues);

		await this.fs.writeFile(
			this.path.join(targetPath, base, ".env"),
			envContent,
			"utf-8",
		);
	}

	private async writeNavigationOrder(targetPath: string): Promise<void> {
		const base = normalizeContentBaseDir(this.settings.contentBaseDir);

		const navOrderPath = this.path.join(
			targetPath,
			base,
			"src",
			"site",
			"_data",
			"navigationOrder.json",
		);

		if (this.settings.navigationOrder) {
			await this.fs.mkdir(this.path.dirname(navOrderPath), {
				recursive: true,
			});

			await this.fs.writeFile(
				navOrderPath,
				JSON.stringify(this.settings.navigationOrder, null, 2),
				"utf-8",
			);
		} else {
			// Remove the file if no ordering is set
			try {
				await this.fs.unlink(navOrderPath);
			} catch {
				// File doesn't exist, that's fine
			}
		}
	}

	private async copyFromVault(
		sourcePath: string,
		targetFolder: string,
		rename?: string,
	) {
		if (sourcePath === "") return;
		const sourceFile = this.vault.getAbstractFileByPath(sourcePath);

		if (sourceFile instanceof TFile) {
			const fileName = rename?.includes(".")
				? rename
				: `${rename ?? sourceFile.basename}.${sourceFile.extension}`;
			const targetPath = this.path.join(targetFolder, fileName);

			await this.fs.writeFile(
				targetPath,
				Buffer.from(await this.vault.readBinary(sourceFile)),
			);
			Logger.debug(`Copied file from ${sourcePath} to ${targetPath}`);
		} else {
			Logger.warn(`File not found at '${sourcePath}'`);
		}
	}

	private async cleanStaleFiles(
		dir: string,
		writtenPaths: Set<string>,
		preservedFiles: Set<string>,
	): Promise<void> {
		try {
			const existingFiles = await this.listFilesRecursive(dir);

			for (const filePath of existingFiles) {
				// Normalize to forward slashes so the lookup matches
				// writtenPaths keys, which come from Obsidian vault paths
				// (always forward-slash separated, even on Windows).
				const relativePath = this.path
					.relative(dir, filePath)
					.split(this.path.sep)
					.join("/");
				const fileName = this.path.basename(filePath);

				if (preservedFiles.has(fileName)) {
					continue;
				}

				if (!writtenPaths.has(relativePath)) {
					await this.fs.unlink(filePath);
					Logger.debug(`Cleaned stale file: ${filePath}`);

					// Remove empty parent directories up to base dir
					let parent = this.path.dirname(filePath);

					while (parent !== dir && parent.startsWith(dir)) {
						try {
							await this.fs.rmdir(parent);
						} catch {
							break; // Directory not empty
						}

						parent = this.path.dirname(parent);
					}
				}
			}
		} catch (e) {
			Logger.warn("Failed to clean stale files", e);
		}
	}

	private async listFilesRecursive(dir: string): Promise<string[]> {
		const files: string[] = [];

		try {
			const entries = await this.fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = this.path.join(dir, entry.name);

				if (entry.isDirectory()) {
					files.push(...(await this.listFilesRecursive(fullPath)));
				} else {
					files.push(fullPath);
				}
			}
		} catch {
			// Directory doesn't exist yet
		}

		return files;
	}
}
