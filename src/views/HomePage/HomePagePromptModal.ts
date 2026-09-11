import { App, Modal, Setting, TFile } from "obsidian";

export type HomePagePromptChoice = "make-home" | "publish-anyway" | "cancel";

export interface HomePagePromptResult {
	choice: HomePagePromptChoice;
	dontAskAgain: boolean;
}

/**
 * Shown before publishing a single note when the garden has no home page
 * yet. Lets the user turn this note into the home page in one click, or
 * publish as-is (optionally never being asked again).
 */
export class HomePagePromptModal extends Modal {
	private file: TFile;
	private resolve: (result: HomePagePromptResult) => void;
	private dontAskAgain = false;
	private settled = false;

	constructor(
		app: App,
		file: TFile,
		resolve: (result: HomePagePromptResult) => void,
	) {
		super(app);
		this.file = file;
		this.resolve = resolve;
	}

	private settle(choice: HomePagePromptChoice) {
		if (this.settled) return;
		this.settled = true;
		this.resolve({ choice, dontAskAgain: this.dontAskAgain });
		this.close();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Your garden has no home page yet" });

		contentEl.createEl("p", {
			text: `Without one, visitors to your site's root see a plain list of notes. Make "${this.file.basename}" the home page?`,
		});

		contentEl.createEl("p", {
			text: 'You can change this any time with the "Set as Garden Home Page" command.',
			cls: "dg-home-prompt-hint",
		});

		new Setting(contentEl).setName("Don't ask again").addToggle((toggle) =>
			toggle.setValue(false).onChange((value) => {
				this.dontAskAgain = value;
			}),
		);

		const buttons = contentEl.createDiv({ cls: "dg-home-prompt-buttons" });

		buttons
			.createEl("button", { text: "Publish anyway" })
			.addEventListener("click", () => this.settle("publish-anyway"));

		buttons
			.createEl("button", {
				text: "Make it the home page",
				cls: "mod-cta",
			})
			.addEventListener("click", () => this.settle("make-home"));

		this.scope.register([], "Enter", () => {
			this.settle("make-home");

			return false;
		});
	}

	onClose() {
		this.contentEl.empty();
		// Closed via Escape or the X: treat as cancel so nothing publishes
		// behind the user's back.
		this.settle("cancel");
	}
}

export function promptForHomePage(
	app: App,
	file: TFile,
): Promise<HomePagePromptResult> {
	return new Promise((resolve) => {
		new HomePagePromptModal(app, file, resolve).open();
	});
}
