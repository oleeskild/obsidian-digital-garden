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
const IMG_USER_PREFIX = "/img/user/";

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
		await this.writeEnvFile(targetPath);

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
				const imageFile = this.vault.getFileByPath(imagePath);

				if (!imageFile) {
					Logger.warn(`Image not found in vault: ${imagePath}`);
					continue;
				}

				const binary = await this.vault.readBinary(imageFile);
				const destPath = path.join(imagesDir, imagePath);
				await fs.mkdir(path.dirname(destPath), { recursive: true });
				await fs.writeFile(destPath, Buffer.from(binary));
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

	private async writeEnvFile(targetPath: string): Promise<void> {
		const s = this.settings;
		const theme = JSON.parse(s.theme);

		const envValues: Record<string, string | boolean> = {
			SITE_NAME_HEADER: s.siteName,
			SITE_MAIN_LANGUAGE: s.mainLanguage,
			SITE_BASE_URL: s.gardenBaseUrl || "",
			SHOW_CREATED_TIMESTAMP: s.showCreatedTimestamp,
			TIMESTAMP_FORMAT: s.timestampFormat,
			SHOW_UPDATED_TIMESTAMP: s.showUpdatedTimestamp,
			NOTE_ICON_DEFAULT: s.defaultNoteIcon,
			NOTE_ICON_TITLE: s.showNoteIconOnTitle,
			NOTE_ICON_FILETREE: s.showNoteIconInFileTree,
			NOTE_ICON_INTERNAL_LINKS: s.showNoteIconOnInternalLink,
			NOTE_ICON_BACK_LINKS: s.showNoteIconOnBackLink,
			STYLE_SETTINGS_CSS: s.styleSettingsCss,
			STYLE_SETTINGS_BODY_CLASSES: s.styleSettingsBodyClasses,
			USE_FULL_RESOLUTION_IMAGES: s.useFullResolutionImages,
			...s.defaultNoteSettings,
		};

		if (theme.name !== "default") {
			envValues["THEME"] = theme.cssUrl;
			envValues["BASE_THEME"] = s.baseTheme;
		}

		// Include non-empty UI strings
		const uiStringMappings: Record<string, string | undefined> = {
			UI_BACKLINK_HEADER: s.uiStrings?.backlinkHeader,
			UI_NO_BACKLINKS_MESSAGE: s.uiStrings?.noBacklinksMessage,
			UI_SEARCH_BUTTON_TEXT: s.uiStrings?.searchButtonText,
			UI_SEARCH_PLACEHOLDER: s.uiStrings?.searchPlaceholder,
			UI_SEARCH_NOT_STARTED_TEXT: s.uiStrings?.searchNotStarted,
			UI_SEARCH_ENTER_HOTKEY: s.uiStrings?.searchEnterHotkey,
			UI_SEARCH_ENTER_HINT: s.uiStrings?.searchEnterHint,
			UI_SEARCH_NAVIGATE_HOTKEY: s.uiStrings?.searchNavigateHotkey,
			UI_SEARCH_NAVIGATE_HINT: s.uiStrings?.searchNavigateHint,
			UI_SEARCH_CLOSE_HOTKEY: s.uiStrings?.searchCloseHotkey,
			UI_SEARCH_CLOSE_HINT: s.uiStrings?.searchCloseHint,
			UI_SEARCH_NO_RESULTS: s.uiStrings?.searchNoResults,
			UI_SEARCH_PREVIEW_PLACEHOLDER:
				s.uiStrings?.searchPreviewPlaceholder,
			UI_CANVAS_DRAG_HINT: s.uiStrings?.canvasDragHint,
			UI_CANVAS_ZOOM_HINT: s.uiStrings?.canvasZoomHint,
			UI_CANVAS_RESET_HINT: s.uiStrings?.canvasResetHint,
		};

		for (const [key, value] of Object.entries(uiStringMappings)) {
			if (value) {
				envValues[key] = value;
			}
		}

		const envContent = Object.entries(envValues)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");

		await fs.writeFile(path.join(targetPath, ".env"), envContent, "utf-8");
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

				if (!writtenPaths.has(relativePath)) {
					await fs.unlink(filePath);
					Logger.debug(`Cleaned stale file: ${filePath}`);

					// Remove empty parent directories up to base dir
					let parent = path.dirname(filePath);

					while (parent !== dir && parent.startsWith(dir)) {
						try {
							await fs.rmdir(parent);
						} catch {
							break; // Directory not empty
						}

						parent = path.dirname(parent);
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
