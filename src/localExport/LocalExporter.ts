import { Notice, Vault } from "obsidian";
import fs from "fs/promises";
import path from "path";
import Logger from "js-logger";
import DigitalGardenSettings from "../models/settings";
import Publisher, {
	NOTE_PATH_BASE,
	IMAGE_PATH_BASE,
} from "../publisher/Publisher";

const PRESERVED_FILES = new Set(["notes.json", "notes.11tydata.js"]);

export class LocalExporter {
	private settings: DigitalGardenSettings;
	private vault: Vault;
	private publisher: Publisher;

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
		const targetPath = this.settings.localExportPath;

		if (!targetPath) {
			new Notice(
				"Set a local garden folder path in plugin settings first.",
			);
			throw new Error("localExportPath is not configured");
		}

		await this.validateTargetPath(targetPath);

		const marked = await this.publisher.getFilesMarkedForPublishing();

		const notesDir = path.join(targetPath, NOTE_PATH_BASE);
		const imagesDir = path.join(targetPath, IMAGE_PATH_BASE);

		await fs.mkdir(notesDir, { recursive: true });
		await fs.mkdir(imagesDir, { recursive: true });

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

				const notePath = path.join(notesDir, file.getPath());
				await fs.mkdir(path.dirname(notePath), { recursive: true });
				await fs.writeFile(notePath, content, "utf-8");
				writtenNotePaths.add(file.getPath());
				notesWritten++;

				// Write assets from this note
				for (const image of assets.images) {
					const imagePath = path.join(
						targetPath,
						"src",
						"site",
						image.path,
					);

					await fs.mkdir(path.dirname(imagePath), {
						recursive: true,
					});

					const buffer = Buffer.from(image.content, "base64");
					await fs.writeFile(imagePath, buffer);
					writtenImagePaths.add(image.path);
					imagesWritten++;
				}
			} catch (e) {
				Logger.error(`Failed to export ${file.getPath()}`, e);
				failed++;
			}
		}

		// Write standalone images (referenced in notes but not returned as assets)
		for (const imagePath of marked.images) {
			if (writtenImagePaths.has(`/img/user/${imagePath}`)) {
				continue;
			}

			try {
				const imageFile = this.vault.getFileByPath(imagePath);

				if (!imageFile) {
					Logger.warn(`Image not found in vault: ${imagePath}`);
					continue;
				}

				const binary = await this.vault.readBinary(imageFile);
				const destPath = path.join(imagesDir, imagePath);
				await fs.mkdir(path.dirname(destPath), { recursive: true });
				await fs.writeFile(destPath, Buffer.from(binary));
				writtenImagePaths.add(`/img/user/${imagePath}`);
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

	private async validateTargetPath(targetPath: string): Promise<void> {
		try {
			await fs.access(targetPath);
		} catch {
			new Notice(`Local garden folder not found: ${targetPath}`);
			throw new Error(`Target path does not exist: ${targetPath}`);
		}

		try {
			await fs.access(path.join(targetPath, "src", "site"));
		} catch {
			new Notice(
				"Folder doesn't look like a digital garden — expected src/site/ directory at " +
					targetPath,
			);
			throw new Error(
				`Target path missing src/site/ directory: ${targetPath}`,
			);
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
				const relativePath = path.relative(dir, filePath);
				const fileName = path.basename(filePath);

				if (preservedFiles.has(fileName)) {
					continue;
				}

				// Check if this file was written in the current export
				const isWritten =
					writtenPaths.has(relativePath) ||
					writtenPaths.has(`/img/user/${relativePath}`);

				if (!isWritten) {
					await fs.unlink(filePath);
					Logger.debug(`Cleaned stale file: ${filePath}`);

					// Remove empty parent directories
					try {
						await fs.rmdir(path.dirname(filePath));
					} catch {
						// Directory not empty, that's fine
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
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

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
