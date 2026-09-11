import { App, FuzzySuggestModal, TFile } from "obsidian";
import { findHomePageFiles } from "src/publishFile/homePage";

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

	private currentHomePaths = new Set<string>();

	/**
	 * Notes already flagged dg-home come first, then the active note, then
	 * the rest of the vault, so the likely answer is one Enter away.
	 */
	getItems(): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const homePages = findHomePageFiles(this.app);
		this.currentHomePaths = new Set(homePages.map((f) => f.path));

		const active = this.app.workspace.getActiveFile();
		const ordered: TFile[] = [...homePages];

		if (
			active &&
			active.extension === "md" &&
			!this.currentHomePaths.has(active.path)
		) {
			ordered.push(active);
		}

		const listed = new Set(ordered.map((f) => f.path));

		return [...ordered, ...files.filter((f) => !listed.has(f.path))];
	}

	getItemText(file: TFile): string {
		const name = file.path.endsWith(".md")
			? file.path.slice(0, -3)
			: file.path;

		return this.currentHomePaths.has(file.path)
			? `${name}  (current home page)`
			: name;
	}

	onChooseItem(file: TFile): void {
		void this.onChoose(file);
	}
}
