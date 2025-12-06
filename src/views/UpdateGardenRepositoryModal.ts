import { App, Modal, getIcon } from "obsidian";

export class UpdateGardenRepositoryModal extends Modal {
	loading: HTMLElement | undefined;
	loadingInterval: NodeJS.Timeout | undefined;
	progressViewTop: HTMLElement;

	constructor(app: App) {
		super(app);
		this.modalEl.addClass("dg-update-modal");

		this.progressViewTop = this.contentEl.createDiv({
			cls: "dg-update-progress",
		});
	}

	renderLoading() {
		this.loading = this.progressViewTop.createDiv({
			cls: "dg-update-loading",
		});
		this.loading.show();

		// Spinner icon
		const spinnerContainer = this.loading.createDiv({
			cls: "dg-update-spinner",
		});
		const spinnerIcon = getIcon("loader-2");

		if (spinnerIcon) {
			spinnerContainer.appendChild(spinnerIcon);
		}

		const loadingText = this.loading.createEl("p", {
			cls: "dg-update-loading-text",
			text: "Creating pull request...",
		});

		this.loading.createEl("p", {
			cls: "dg-update-loading-subtext",
			text: "This usually takes 30-60 seconds",
		});

		let dots = 0;

		this.loadingInterval = setInterval(() => {
			dots = (dots + 1) % 4;

			loadingText.textContent =
				"Creating pull request" + ".".repeat(dots);
		}, 400);
	}

	renderSuccess(prUrl: string) {
		this.loading?.remove();
		clearInterval(this.loadingInterval);

		const successContainer = this.progressViewTop.createDiv({
			cls: "dg-update-success",
		});

		// Success icon
		const iconContainer = successContainer.createDiv({
			cls: "dg-update-icon dg-update-icon-success",
		});
		const checkIcon = getIcon("check-circle");

		if (checkIcon) {
			iconContainer.appendChild(checkIcon);
		}

		if (prUrl) {
			successContainer.createEl("h3", {
				text: "Pull request created!",
				cls: "dg-update-title",
			});

			successContainer.createEl("p", {
				text: "Approve the PR to make the changes go live.",
				cls: "dg-update-message",
			});

			const linkContainer = successContainer.createDiv({
				cls: "dg-update-link-container",
			});

			const link = linkContainer.createEl("a", {
				text: "Open Pull Request",
				href: prUrl,
				cls: "dg-update-link",
			});

			const externalIcon = getIcon("external-link");

			if (externalIcon) {
				link.appendChild(externalIcon);
			}
		} else {
			successContainer.createEl("h3", {
				text: "Already up to date!",
				cls: "dg-update-title",
			});

			successContainer.createEl("p", {
				text: "Your site template is already on the latest version.",
				cls: "dg-update-message",
			});
		}
	}

	renderError() {
		this.loading?.remove();
		clearInterval(this.loadingInterval);

		const errorContainer = this.progressViewTop.createDiv({
			cls: "dg-update-error",
		});

		// Error icon
		const iconContainer = errorContainer.createDiv({
			cls: "dg-update-icon dg-update-icon-error",
		});
		const alertIcon = getIcon("alert-circle");

		if (alertIcon) {
			iconContainer.appendChild(alertIcon);
		}

		errorContainer.createEl("h3", {
			text: "Something went wrong",
			cls: "dg-update-title",
		});

		errorContainer.createEl("p", {
			text: 'Try deleting the "update-template" branch in your GitHub repository and try again.',
			cls: "dg-update-message",
		});
	}
}
