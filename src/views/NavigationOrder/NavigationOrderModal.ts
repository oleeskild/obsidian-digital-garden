import { App, Modal } from "obsidian";
import NavigationOrderView from "./NavigationOrderView.svelte";
import { RepositoryConnection } from "../../repositoryConnection/RepositoryConnection";
import Publisher from "../../publisher/Publisher";

export class NavigationOrderModal {
	modal: Modal;
	private view: NavigationOrderView | undefined;

	constructor(
		app: App,
		private repositoryConnection: RepositoryConnection,
		private publisher: Publisher,
	) {
		this.modal = new Modal(app);
		this.modal.titleEl.innerText = "Reorder Navigation";
	}

	open = () => {
		this.modal.onClose = () => {
			this.view?.$destroy();
		};

		this.modal.onOpen = () => {
			this.modal.contentEl.empty();
			this.modal.contentEl.addClass("dg-navigation-order-modal");

			this.view = new NavigationOrderView({
				target: this.modal.contentEl,
				props: {
					repositoryConnection: this.repositoryConnection,
					publisher: this.publisher,
					close: () => this.modal.close(),
				},
			});
		};

		this.modal.open();
	};
}
