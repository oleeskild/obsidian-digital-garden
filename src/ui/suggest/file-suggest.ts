import {
	AbstractInputSuggest,
	type App,
	type TAbstractFile,
	TFile,
} from "obsidian";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp"];

/**
 * Returns the files whose extension is in `extensions` and whose path
 * contains `query` (case-insensitive).
 */
export const filterFilesByExtension = (
	files: TAbstractFile[],
	extensions: string[],
	query: string,
): TFile[] => {
	const lowerCaseQuery = query.toLowerCase();

	return files.filter(
		(file): file is TFile =>
			file instanceof TFile &&
			extensions.includes(file.extension.toLowerCase()) &&
			file.path.toLowerCase().includes(lowerCaseQuery),
	);
};

/**
 * Suggests vault files with the given extensions for a text input.
 *
 * Built on Obsidian's AbstractInputSuggest so the dropdown is rendered in the
 * same window as the input (e.g. when settings open in a popout window).
 */
abstract class FileExtensionSuggest extends AbstractInputSuggest<TFile> {
	protected abstract readonly extensions: string[];

	constructor(
		app: App,
		private inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
	}

	protected getSuggestions(query: string): TFile[] {
		return filterFilesByExtension(
			this.app.vault.getAllLoadedFiles(),
			this.extensions,
			query,
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.path);
		// Notify TextComponent.onChange listeners, which listen for "input".
		this.inputEl.trigger("input");
		this.close();
	}
}

export class SvgFileSuggest extends FileExtensionSuggest {
	protected readonly extensions = ["svg"];
}

export class ImageFileSuggest extends FileExtensionSuggest {
	protected readonly extensions = IMAGE_EXTENSIONS;
}
