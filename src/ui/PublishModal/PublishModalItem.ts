import { ButtonComponent } from "obsidian";
import { PublishStatus } from "../../publisher/PublishStatusManager";

export interface IModalItemButton {
	cta: string;
	callback: () => Promise<void>;
}

export class PublishModalItem {
	private button: ButtonComponent | undefined;
	private countElement: HTMLElement;
	private toggledList: HTMLUListElement;
	private getItems: (publishStatus: PublishStatus) => string[];

	constructor(
		parent: HTMLElement,
		title: string,
		getItems: (publishStatus: PublishStatus) => string[],
		buttonProps?: IModalItemButton,
	) {
		this.getItems = getItems;

		const headerContainer = parent.createEl("div", {
			attr: {
				style: "display: flex; justify-content: space-between; margin-bottom: 10px; align-items:center",
			},
		});

		const titleContainer = headerContainer.createEl("div", {
			attr: { style: "display: flex; align-items:center" },
		});

		const toggleHeader = titleContainer.createEl("h3", {
			text: `➕️ ${title}`,
			attr: { class: "collapsable collapsed" },
		});

		const counter = titleContainer.createEl("span", {
			attr: { class: "count", style: "margin-left:10px" },
		});

		if (buttonProps) {
			const button = new ButtonComponent(headerContainer)
				.setButtonText(buttonProps.cta)
				.onClick(async () => {
					button.setDisabled(true);
					await buttonProps.callback();
					button.setDisabled(false);
				});
			this.button = button;
		}

		const toggledList = parent.createEl("ul");
		toggledList.hide();

		headerContainer.onClickEvent(() => {
			if (toggledList.isShown()) {
				toggleHeader.textContent = `➕️ ${title}`;
				toggledList.hide();
				toggleHeader.removeClass("open");
				toggleHeader.addClass("collapsed");
			} else {
				toggleHeader.textContent = `➖ ${title}`;
				toggledList.show();
				toggleHeader.removeClass("collapsed");
				toggleHeader.addClass("open");
			}
		});
		this.countElement = counter;
		this.toggledList = toggledList;
	}

	clear() {
		this.toggledList.empty();
		this.countElement.innerText = "";
	}

	populateNotes(publishStatus: PublishStatus) {
		const notes = this.getItems(publishStatus);
		notes.map((path) =>
			this.toggledList.createEl("li", {
				text: path,
			}),
		);
		this.countElement.textContent = `(${notes.length} notes)`;

		if (this.button) {
			if (notes.length === 0) {
				this.button.setDisabled(true);
			} else {
				this.button.setDisabled(false);
			}
		}
	}
}
