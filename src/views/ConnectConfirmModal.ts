import { App, Modal } from "obsidian";
import type { ConnectConfirmDetails } from "src/forestry/connectWithCode";

/**
 * Shown when the Forestry.md dashboard's "Connect Obsidian" link lands in
 * this vault. Whichever vault is open receives the link, so the user must
 * confirm it is the right one before any settings change.
 */
export class ConnectConfirmModal extends Modal {
	private details: ConnectConfirmDetails;
	private resolve: (confirmed: boolean) => void;
	private settled = false;

	constructor(
		app: App,
		details: ConnectConfirmDetails,
		resolve: (confirmed: boolean) => void,
	) {
		super(app);
		this.details = details;
		this.resolve = resolve;
	}

	private settle(confirmed: boolean) {
		if (this.settled) return;
		this.settled = true;
		this.resolve(confirmed);
		this.close();
	}

	onOpen() {
		const { contentEl } = this;
		const { vaultName, gardenLabel, currentTarget } = this.details;

		contentEl.createEl("h2", { text: "Connect this vault?" });

		contentEl.createEl("p", {
			text: `Connect the vault "${vaultName}" to the garden ${gardenLabel}?`,
		});

		if (currentTarget) {
			contentEl.createEl("p", { text: currentTarget });
		}

		contentEl.createEl("p", {
			text: "Nothing is published when you connect. Notes only go online when you mark them with dg-publish and publish them.",
			cls: "dg-connect-confirm-hint",
		});

		contentEl.createEl("p", {
			text: "Wrong vault? Click Cancel, open the right vault in Obsidian, then click Connect in the Forestry.md dashboard again.",
			cls: "dg-connect-confirm-hint",
		});

		const buttons = contentEl.createDiv({
			cls: "dg-connect-confirm-buttons",
		});

		const cancelButton = buttons.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.settle(false));

		buttons
			.createEl("button", {
				text: "Connect this vault",
				cls: "mod-cta",
			})
			.addEventListener("click", () => this.settle(true));

		// Default focus on Cancel so a stray Enter never connects.
		cancelButton.focus();
	}

	onClose() {
		this.contentEl.empty();
		// Closed via Escape or the X: treat as cancel so nothing changes.
		this.settle(false);
	}
}

export function confirmConnect(
	app: App,
	details: ConnectConfirmDetails,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConnectConfirmModal(app, details, resolve).open();
	});
}
