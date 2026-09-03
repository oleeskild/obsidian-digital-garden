import { App, FuzzySuggestModal, TFile } from "obsidian";

/**
 * Fuzzy picker over the vault's markdown notes used to choose the garden's
 * home page. The active note is listed first so the common case ("this
 * one") is a single Enter. Escape closes without choosing.
 */
export class HomePagePickerModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void | Promise<void>;

	constructor(app: App, onChoose: (file: TFile) => void | Promise<void>) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Choose your garden's home page");

		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to set as home page and publish" },
			{ command: "esc", purpose: "to skip for now" },
		]);
	}

	getItems(): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const active = this.app.workspace.getActiveFile();

		if (!active || active.extension !== "md") {
			return files;
		}

		return [active, ...files.filter((f) => f.path !== active.path)];
	}

	getItemText(file: TFile): string {
		return file.path.endsWith(".md") ? file.path.slice(0, -3) : file.path;
	}

	onChooseItem(file: TFile): void {
		void this.onChoose(file);
	}
}
