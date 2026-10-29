import { mount, unmount } from "svelte";
import {
	App,
	ButtonComponent,
	getIcon,
	Modal,
	Notice,
	Platform,
	Setting,
} from "obsidian";
import DigitalGardenSiteManager from "src/repositoryConnection/DigitalGardenSiteManager";

import DigitalGardenSettings from "../../models/settings";
import Publisher from "../../publisher/Publisher";
import { getDebugLog } from "../../utils/debugLog";
import { addFilterInput } from "./addFilterInput";
import { GithubSettings } from "./GithubSettings";
import RewriteSettings from "./RewriteSettings.svelte";
import {
	canApplyTemplate,
	hasUpdates,
	TemplateUpdater,
	TemplateUpdateChecker,
} from "../../repositoryConnection/TemplateManager";
import Logger from "js-logger";
import ForestrySettings from "./ForestrySettings.svelte";
import { PublishPlatform } from "src/models/PublishPlatform";

type FrontmatterKey =
	| "createdTimestampKey"
	| "updatedTimestampKey"
	| "contentClassesKey"
	| "noteIconKey";

export default class SettingView {
	private app: App;
	settings: DigitalGardenSettings;
	saveSettings: () => Promise<void>;
	private settingsRootElement: HTMLElement;
	private afterForestryConnect: (() => void) | null;
	private openSiteSettings: () => void;

	/** Holds everything below the connection; filled once connected. */
	private restEl: HTMLElement | null = null;
	private restRendered = false;
	private updateSectionAnchor: HTMLElement | null = null;

	/**
	 * Renders the self-hosted site template section into
	 * updateSectionAnchor. Set by the settings tab before initialize().
	 */
	renderTemplateSection: (() => Promise<void>) | null = null;

	constructor(
		app: App,
		settingsRootElement: HTMLElement,
		settings: DigitalGardenSettings,
		saveSettings: () => Promise<void>,
		afterForestryConnect: (() => void) | null = null,
		openSiteSettings: () => void = () => {},
	) {
		this.app = app;
		this.settingsRootElement = settingsRootElement;
		this.settingsRootElement.classList.add("dg-settings");
		this.settings = settings;
		this.saveSettings = saveSettings;
		this.afterForestryConnect = afterForestryConnect;
		this.openSiteSettings = openSiteSettings;
	}

	getIcon(name: string): Node {
		return getIcon(name) ?? document.createElement("span");
	}

	private reInitializeSettings() {
		this.initialize();
	}

	/**
	 * Switch the active publish platform and re-render the settings tab so the
	 * platform dropdown and its panel reflect the new choice. Used by the
	 * dropdown and by the self-hosted setup nudge.
	 */
	async switchPublishPlatform(platform: PublishPlatform) {
		this.settings.publishPlatform = platform;
		await this.saveSettings();
		this.reInitializeSettings();
	}

	private isConnected(): boolean {
		if (this.settings.publishPlatform === PublishPlatform.ForestryMd) {
			return !!this.settings.forestrySettings.apiKey;
		}

		const { githubRepo, githubUserName, githubToken } = this.settings;

		return !!(githubRepo && githubUserName && githubToken);
	}

	/** Called by the GitHub panel after each connection check. */
	onConnectionChanged(connected: boolean) {
		if (connected && !this.restRendered) this.renderRest();
	}

	async initialize() {
		const root = this.settingsRootElement;
		root.empty();
		this.restRendered = false;
		this.updateSectionAnchor = null;

		const intro = root.createEl("p", { cls: "dg-settings-intro" });
		intro.appendText("New here? Follow the ");

		intro.createEl("a", {
			text: "setup guide",
			href: "https://docs.forestry.md/getting-started/01-getting-started/",
		});
		intro.appendText(" to get your garden online.");

		if (
			this.isConnected() &&
			!this.settings.siteSettingsMovedNoticeDismissed
		) {
			this.renderSiteSettingsMovedNotice(root);
		}

		new Setting(root)
			.setName("Publish to")
			.setDesc("Where your garden is hosted.")
			.addDropdown((dd) => {
				dd.addOption(PublishPlatform.ForestryMd, "Forestry.md");

				dd.addOption(
					PublishPlatform.SelfHosted,
					"GitHub (self-hosted)",
				);
				dd.setValue(this.settings.publishPlatform);

				dd.onChange(async (val) => {
					await this.switchPublishPlatform(val as PublishPlatform);
				});
			});

		const platformEl = root.createDiv({ cls: "publish-platform-settings" });
		this.restEl = root.createDiv();

		this.initializePublishPlatformSettings(platformEl);

		if (this.isConnected()) {
			this.renderRest();
		} else {
			this.restEl.createEl("p", {
				cls: "dg-settings-next",
				text: "Connect your garden to see the rest of the settings.",
			});
		}
	}

	private initializePublishPlatformSettings(target: HTMLElement) {
		target.empty();

		if (this.settings.publishPlatform === PublishPlatform.SelfHosted) {
			new GithubSettings(this, target);
		} else {
			mount(ForestrySettings, {
				target,
				props: {
					settings: this.settings,
					saveSettings: this.saveSettings,
					onConnect: async () => {
						this.reInitializeSettings();
					},
					afterConnect: this.afterForestryConnect,
				},
			});
		}
	}

	/** Points existing users to where the site settings went. */
	private renderSiteSettingsMovedNotice(root: HTMLElement) {
		const notice = root.createDiv({
			cls: "dg-settings-moved",
			attr: { role: "note" },
		});
		const heading = notice.createDiv({ cls: "dg-settings-moved-heading" });
		const icon = getIcon("info");

		if (icon) heading.appendChild(icon);
		heading.createSpan({ text: "Site settings have moved" });

		notice.createEl("p", {
			cls: "dg-settings-moved-text",
			text: "Theme, appearance, note display, interface text, navigation and garden plugins are now on the Site tab of the Publication Center. Changes there are published together with your notes.",
		});

		const actions = notice.createDiv({ cls: "dg-settings-moved-actions" });

		new ButtonComponent(actions)
			.setButtonText("Open site settings")
			.setCta()
			.onClick(() => {
				this.closeSettings();
				this.openSiteSettings();
			});

		new ButtonComponent(actions)
			.setButtonText("Got it")
			.onClick(async () => {
				this.settings.siteSettingsMovedNoticeDismissed = true;
				await this.saveSettings();
				notice.remove();

				// The "Your site" row stands in for the notice from now on.
				if (this.restRendered) this.renderRest();
			});
	}

	/** Everything that needs a connected garden. */
	private renderRest() {
		const el = this.restEl;

		if (!el) return;

		el.empty();
		this.restRendered = true;

		// While the "moved" notice shows, it already offers this.
		if (this.settings.siteSettingsMovedNoticeDismissed) {
			new Setting(el).setName("Your site").setHeading();

			new Setting(el)
				.setName("Site settings")
				.setDesc(
					"Theme, note display, interface text, site address, navigation and garden plugins are edited on the Site tab of the Publication Center and published with your notes.",
				)
				.addButton((cb) =>
					cb.setButtonText("Open site settings").onClick(() => {
						this.closeSettings();
						this.openSiteSettings();
					}),
				);
		}

		new Setting(el)
			.setName("Publishing")
			.setDesc(
				"How notes are prepared when you publish them. Changes apply the next time a note is published.",
			)
			.setHeading();
		this.initializeSlugifySetting(el);
		this.initializeExcalidrawSetting(el);

		new Setting(el)
			.setName("Path rewrites")
			.setDesc(
				"Publish notes from one folder as if they were in another, e.g. drop a top-level folder from your site's URLs.",
			)
			.addButton((cb) =>
				cb
					.setButtonText("Edit rewrites")
					.onClick(() => this.openPathRewriteRulesModal()),
			);

		this.initializeCustomFilterSettings(el);
		this.initializeFrontmatterKeys(el);

		if (this.settings.publishPlatform === PublishPlatform.SelfHosted) {
			new Setting(el).setName("Site template").setHeading();
			this.updateSectionAnchor = el.createDiv();
			this.renderTemplateSection?.();

			// The export command needs a local file system.
			if (Platform.isDesktopApp) {
				new Setting(el).setName("Local export").setHeading();

				new Setting(el)
					.setName("Local garden folder")
					.setDesc(
						"Full path to a local copy of the garden template. Used by the Export garden to local folder command.",
					)
					.addText((text) => {
						text.inputEl.addClass("dg-settings-wide-input");

						text.setPlaceholder("/path/to/your/digitalgarden")
							.setValue(this.settings.localExportPath ?? "")
							.onChange(async (value) => {
								this.settings.localExportPath = value;
								await this.saveSettings();
							});
					});
			}
		}

		new Setting(el).setName("Troubleshooting").setHeading();

		new Setting(el)
			.setName("Detailed logging")
			.setDesc(
				"Record more detail about what the plugin does, to include when you ask for help.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.logLevel === Logger.DEBUG)
					.onChange(async (value) => {
						this.settings.logLevel = value
							? Logger.DEBUG
							: undefined;
						Logger.setLevel(value ? Logger.DEBUG : Logger.WARN);
						await this.saveSettings();
					});
			});

		new Setting(el)
			.setName("Copy the plugin log")
			.setDesc(
				"Copies the plugin's recent log, to paste in the Discord when you ask for help with a failed publish.",
			)
			.addButton((cb) =>
				cb.setButtonText("Copy log").onClick(async () => {
					await navigator.clipboard.writeText(getDebugLog());
					new Notice("Plugin log copied to the clipboard.");
				}),
			);

		new Setting(el)
			.setName("Support development")
			.setDesc(
				"Digital Garden is free and open source. If it's useful to you, you can buy the developer a coffee.",
			)
			.addButton((cb) =>
				cb.setButtonText("Support on Ko-fi").onClick(() => {
					window.open("https://ko-fi.com/oleeskild");
				}),
			);
	}

	// Obsidian has no public API for this; the setting modal is internal.
	private closeSettings() {
		(
			this.app as unknown as { setting?: { close(): void } }
		).setting?.close();
	}

	private initializeSlugifySetting(el: HTMLElement) {
		new Setting(el)
			.setName("Simple note URLs")
			.setDesc(
				'Turn "/My Folder/My Note/" into "/my-folder/my-note". Turn this off if your note names use non-Latin characters.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.slugifyEnabled)
					.onChange(async (value) => {
						this.settings.slugifyEnabled = value;
						await this.saveSettings();
					}),
			);
	}

	private initializeExcalidrawSetting(el: HTMLElement) {
		new Setting(el)
			.setName("Publish Excalidraw drawings as SVG")
			.setDesc(
				"Export drawings as images when you publish, including their embedded images, notes and fonts. Needs the Excalidraw plugin. When off, drawings use an interactive viewer that can't show embedded files.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.settings.excalidrawSvgExportEnabled)
					.onChange(async (value) => {
						this.settings.excalidrawSvgExportEnabled = value;
						await this.saveSettings();
					}),
			);
	}

	/** Read from each note when it's published; local only. */
	private initializeFrontmatterKeys(el: HTMLElement) {
		new Setting(el).setName("Frontmatter keys").setHeading();

		el.createEl("p", {
			cls: "dg-settings-note",
			text: "Properties the plugin reads from each note. Changes apply to notes the next time you publish them.",
		});

		const keys: { key: FrontmatterKey; name: string; desc: string }[] = [
			{
				key: "createdTimestampKey",
				name: "Created date",
				desc: "Leave empty to use the file's creation time.",
			},
			{
				key: "updatedTimestampKey",
				name: "Updated date",
				desc: "Leave empty to use the file's modified time.",
			},
			{
				key: "contentClassesKey",
				name: "CSS classes",
				desc: "Classes added to the note's body on the site.",
			},
			{
				key: "noteIconKey",
				name: "Note icon",
				desc: "The note's icon, when note icons are on.",
			},
		];

		for (const { key, name, desc } of keys) {
			new Setting(el)
				.setName(name)
				.setDesc(desc)
				.addText((text) =>
					text
						.setValue(this.settings[key])
						.onChange(async (value) => {
							this.settings[key] = value;
							await this.saveSettings();
						}),
				);
		}
	}

	private openPathRewriteRulesModal() {
		const publisher = new Publisher(
			this.app.vault,
			this.app.metadataCache,
			this.settings,
		);
		const rewriteRulesModal = new Modal(this.app);
		rewriteRulesModal.titleEl.setText("Path rewrites");
		rewriteRulesModal.open();

		const modalContent = mount(RewriteSettings, {
			target: rewriteRulesModal.contentEl,
			props: {
				publisher,
				settings: this.settings,
				saveSettings: this.saveSettings,
				closeModal: () => rewriteRulesModal.close(),
			},
		});

		rewriteRulesModal.onClose = () => {
			unmount(modalContent);
		};
	}

	private initializeCustomFilterSettings(el: HTMLElement) {
		const customFilterModal = new Modal(this.app);
		customFilterModal.titleEl.setText("Text filters");
		customFilterModal.modalEl.addClass("dg-filters-modal");

		new Setting(el)
			.setName("Text filters")
			.setDesc(
				"Find and replace text in notes when you publish them, using regular expressions.",
			)
			.addButton((cb) =>
				cb
					.setButtonText("Edit filters")
					.onClick(() => customFilterModal.open()),
			);

		const content = customFilterModal.contentEl;

		const intro = content.createEl("p", { cls: "dg-settings-note" });

		intro.appendText(
			"Each filter has a regular expression, the text to put in its place, and ",
		);

		intro.createEl("a", {
			text: "flags",
			href: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#advanced_searching_with_flags",
		});
		intro.appendText(". For example, ");
		intro.createEl("code", { text: ":smile:" });
		intro.appendText(" → ");
		intro.createEl("code", { text: "😀" });
		intro.appendText(" with flag ");
		intro.createEl("code", { text: "g" });
		intro.appendText(" replaces every :smile:.");

		const filterList = content.createDiv({ cls: "dg-filter-list" });

		const renderFilters = () => {
			filterList.empty();

			if (this.settings.customFilters.length === 0) {
				filterList.createEl("p", {
					cls: "dg-settings-note",
					text: "No filters yet.",
				});
			}

			this.settings.customFilters.forEach((filter, i) =>
				addFilterInput(filter, filterList, i, this, renderFilters),
			);
		};

		new Setting(content).addButton((button) =>
			button.setButtonText("Add filter").onClick(async () => {
				this.settings.customFilters.push({
					pattern: "",
					flags: "g",
					replace: "",
				});
				await this.saveSettings();
				renderFilters();
			}),
		);

		renderFilters();
	}

	async renderCreatePr(
		modal: Modal,
		handlePR: (
			button: ButtonComponent,
			updater: TemplateUpdater,
		) => Promise<void>,
		siteManager: DigitalGardenSiteManager,
	) {
		const target = this.updateSectionAnchor;

		// Rendered only once the garden is connected (see renderRest).
		if (!target) return;

		new Setting(target)
			.setName("Check for template updates on startup")
			.setDesc(
				"Show a notice when Obsidian starts if a new template version is out. Turn this off if your template is customized so much it will never match; you can still check below.",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(!this.settings.disableTemplateUpdateNotice)
					.onChange(async (value) => {
						this.settings.disableTemplateUpdateNotice = !value;
						await this.saveSettings();
					});
			});

		const statusContainer = target.createDiv({
			cls: "dg-template-status",
		});

		const runCheck = async (): Promise<
			TemplateUpdater | TemplateUpdateChecker | null
		> => {
			statusContainer.empty();

			new Setting(statusContainer)
				.setName("Site template")
				.setDesc("Checking for updates…")
				.addButton((button) => {
					button.setButtonText("Checking…");
					button.setDisabled(true);
				});

			Logger.time("checkForUpdate");

			try {
				return await (
					await siteManager.getTemplateUpdater()
				).checkForUpdates();
			} catch (error) {
				Logger.warn("Failed to check for template updates", error);
				statusContainer.empty();

				new Setting(statusContainer)
					.setName("Site template")
					.setDesc(
						"Couldn't check for template updates. Check your connection and GitHub settings above, then try again.",
					)
					.addButton((button) => {
						button.setButtonText("Try again");

						button.onClick(async () => {
							const result = await runCheck();

							if (result) renderResult(result);
						});
					});

				return null;
			} finally {
				Logger.timeEnd("checkForUpdate");
			}
		};

		// Modal content is built once, the first time a check succeeds.
		let modalBuilt = false;

		const renderResult = (
			updater: TemplateUpdater | TemplateUpdateChecker,
		) => {
			statusContainer.empty();

			const updateAvailable = hasUpdates(updater);
			const applier = canApplyTemplate(updater) ? updater : null;
			const latestVersion = updater.newestTemplateVersion ?? "latest";

			const fileCountText = (count: number) =>
				`${count} template file${count === 1 ? "" : "s"}`;

			let description: string;

			if (updateAvailable) {
				description = `${
					updater.installedVersion
						? `Version ${latestVersion} is available (you have ${updater.installedVersion}). `
						: ""
				}Update when you update the plugin, so your site supports all its features.`;
			} else if (applier) {
				description = `Your site template is up to date (${latestVersion}). ${fileCountText(
					applier.changedFileCount,
				)} differ from the default template, likely your own customizations. Re-applying creates a pull request that overwrites them.`;
			} else {
				description = `Your site template is up to date (${latestVersion}).`;
			}

			new Setting(statusContainer)
				.setName("Site template")
				.setDesc(description)
				.addButton((button) => {
					if (updateAvailable) {
						button.setButtonText(`Update to ${latestVersion}`);
						button.setCta();
					} else if (applier) {
						button.setButtonText("Re-apply template");
					} else {
						button.setButtonText("Up to date");
						button.setDisabled(true);
					}

					button.onClick(() => {
						modal.open();
					});
				});

			// Gardens from before the template version file can't tell an
			// update from their own customizations; let the user record the
			// version.
			if (updateAvailable && applier && !applier.installedVersion) {
				new Setting(statusContainer)
					.setName("Already up to date?")
					.setDesc(
						`If you have already updated your template and the differing files are your own customizations, record ${latestVersion} as your template version. Future update notices will then only appear for new template releases.`,
					)
					.addButton((button) => {
						button.setButtonText("Mark as up to date");

						button.onClick(async () => {
							button.setDisabled(true);
							button.setButtonText("Saving…");

							try {
								await applier.markAsUpToDate();

								new Notice(
									`Site template marked as version ${latestVersion}.`,
								);
								button.setButtonText("Marked as up to date");
							} catch (error) {
								Logger.error(
									"Failed to mark template as up to date",
									error,
								);

								new Notice(
									"Couldn't save the template version. Try again.",
								);
								button.setButtonText("Mark as up to date");
								button.setDisabled(false);
							}
						});
					});
			}

			if (!modalBuilt) {
				modalBuilt = true;
				buildModal(updater, !updateAvailable && applier !== null);
			}
		};

		const buildModal = (
			updater: TemplateUpdater | TemplateUpdateChecker,
			isReapply: boolean,
		) => {
			// Modal title
			modal.titleEl.empty();

			const titleContainer = modal.titleEl.createDiv({
				cls: "dg-modal-title",
			});
			const syncIcon = getIcon("refresh-cw");

			if (syncIcon) {
				titleContainer.appendChild(syncIcon);
			}

			titleContainer.createSpan({
				text: isReapply
					? "Re-apply site template"
					: "Update site template",
			});

			// Modal content
			const updateSection = modal.contentEl.createDiv({
				cls: "dg-update-section",
			});

			const infoContainer = updateSection.createDiv({
				cls: "dg-update-info",
			});

			const infoIcon = getIcon("info");

			if (infoIcon) {
				infoContainer.appendChild(infoIcon);
			}

			infoContainer.createDiv({
				cls: "dg-update-info-text",
				text: isReapply
					? "This creates a pull request that resets your template files to the default template. Any customizations you made to those files are overwritten. Your site doesn't change until you merge the pull request."
					: "This creates a pull request with the latest template changes. Your site doesn't change until you merge the pull request.",
			});

			const buttonContainer = updateSection.createDiv({
				cls: "dg-update-button-container",
			});

			const createPrButton = buttonContainer.createEl("button", {
				text: "Create pull request",
				cls: isReapply ? "mod-warning" : "mod-cta",
			});

			createPrButton.addEventListener("click", () => {
				handlePR(
					{
						setDisabled: (d: boolean) =>
							(createPrButton.disabled = d),
					} as unknown as ButtonComponent,
					updater as TemplateUpdater,
				);
			});
		};

		const updater = await runCheck();

		if (!updater) return;
		renderResult(updater);
	}

	renderPullRequestHistory(modal: Modal, previousPrUrls: string[]) {
		if (previousPrUrls.length === 0) {
			return;
		}

		const history = modal.contentEl.createEl("details", {
			cls: "dg-pr-history",
		});
		history.createEl("summary", { text: "Recent pull requests" });

		const list = history.createEl("ul", { cls: "dg-pr-history-list" });

		for (const prUrl of previousPrUrls) {
			const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];

			list.createEl("li").createEl("a", {
				text: prNumber ? `Pull request #${prNumber}` : prUrl,
				href: prUrl,
			});
		}
	}
}
