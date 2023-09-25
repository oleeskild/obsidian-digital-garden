import { App, Modal } from "obsidian";

export class UpdateGardenRepositoryModal extends Modal {
	loading: HTMLElement | undefined;
	loadingInterval: NodeJS.Timeout | undefined;
	progressViewTop: HTMLElement;

	constructor(app: App) {
		super(app);
		this.progressViewTop = this.contentEl.createDiv();
	}

	renderLoading() {
		this.loading = this.progressViewTop.createDiv();
		this.loading.show();
		const text = "Creating PR. This should take about 30-60 seconds";

		const loadingText = this.loading?.createEl("h5", { text });

		this.loadingInterval = setInterval(() => {
			if (loadingText.innerText === `${text}`) {
				loadingText.innerText = `${text}.`;
			} else if (loadingText.innerText === `${text}.`) {
				loadingText.innerText = `${text}..`;
			} else if (loadingText.innerText === `${text}..`) {
				loadingText.innerText = `${text}...`;
			} else {
				loadingText.innerText = `${text}`;
			}
		}, 400);
	}

	renderSuccess(prUrl: string) {
		this.loading?.remove();
		clearInterval(this.loadingInterval);

		const successmessage = prUrl
			? { text: `🎉 Done! Approve your PR to make the changes go live.` }
			: {
					text: "You already have the latest template 🎉 No need to create a PR.",
			  };
		const linkText = { text: `${prUrl}`, href: prUrl };
		this.progressViewTop.createEl("h2", successmessage);

		if (prUrl) {
			this.progressViewTop.createEl("a", linkText);
		}
		this.progressViewTop.createEl("br");
	}

	renderError() {
		this.loading?.remove();
		clearInterval(this.loadingInterval);

		const errorMsg = {
			text: "❌ Something went wrong. Try deleting the branch in GitHub.",
			attr: {},
		};
		this.progressViewTop.createEl("p", errorMsg);
	}
}
