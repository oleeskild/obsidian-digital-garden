import DigitalGardenSettings from './DigitalGardenSettings';
import { ButtonComponent, Modal, Notice, Setting, App, TFile, debounce, MetadataCache, getIcon } from 'obsidian';
import axios from "axios";
import { Octokit } from '@octokit/core';
import { Base64 } from 'js-base64';
import { arrayBufferToBase64, getGardenPathForNote, getRewriteRules } from './utils';
import DigitalGarden from 'main';
import DigitalGardenSiteManager from './DigitalGardenSiteManager';
import { SvgFileSuggest } from './ui/file-suggest';
import { addFilterInput } from './ui/addFilterInput';

export default class SettingView {
    private app: App;
    private settings: DigitalGardenSettings;
    private saveSettings: () => Promise<void>;
    private settingsRootElement: HTMLElement;
    private progressViewTop: HTMLElement;
    private loading: HTMLElement;
    private loadingInterval: any;
    debouncedSaveAndUpdate = debounce(this.saveSiteSettingsAndUpdateEnv, 500, true);

    constructor(app: App, settingsRootElement: HTMLElement, settings: DigitalGardenSettings, saveSettings: () => Promise<void>) {
        this.app = app;
        this.settingsRootElement = settingsRootElement;
        this.settingsRootElement.classList.add("dg-settings");
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    async initialize(prModal: Modal) {
        this.settingsRootElement.empty();
        this.settingsRootElement.createEl('h1', { text: 'Digital Garden Settings' });
        const linkDiv = this.settingsRootElement.createEl('div', { attr: { style: "margin-bottom: 10px;" } })
        linkDiv.createEl('span', { text: 'Remember to read the setup guide if you haven\'t already. It can be found ' });
        linkDiv.createEl('a', { text: 'here.', href: "https://dg-docs.ole.dev/getting-started/01-getting-started/" });

        this.settingsRootElement.createEl('h3', { text: 'GitHub Authentication (required)' }).prepend(getIcon("github"));
        this.initializeGitHubRepoSetting();
        this.initializeGitHubUserNameSetting();
        this.initializeGitHubTokenSetting();

        this.settingsRootElement.createEl('h3', { text: 'URL' }).prepend(getIcon("link"));
        this.initializeGitHubBaseURLSetting();
        this.initializeSlugifySetting();

        this.settingsRootElement.createEl('h3', { text: 'Features' }).prepend(getIcon("star"));
        this.initializeDefaultNoteSettings();

        this.settingsRootElement.createEl('h3', { text: 'Appearance' }).prepend(getIcon("brush"));
        this.initializeThemesSettings();

        this.settingsRootElement.createEl('h3', { text: 'Advanced' }).prepend(getIcon("cog"));
		this.initializePathRewriteSettings();
		this.initializeCustomFilterSettings();
        prModal.titleEl.createEl("h1", "Site template settings");
    }

    private async initializeDefaultNoteSettings() {
        const noteSettingsModal = new Modal(this.app);
        noteSettingsModal.titleEl.createEl("h1", { text: "Default Note Settings" });
        
                
        const linkDiv = noteSettingsModal.contentEl.createEl('div', { attr: { style: "margin-bottom: 20px; margin-top: -30px;" } })
        linkDiv.createEl('span', { text: 'Note Setting Docs is available ' });
        linkDiv.createEl('a', { text: 'here.', href: "https://dg-docs.ole.dev/getting-started/03-note-settings/" });

        // noteSettingsModal.contentEl.createEl("div", { text: `Toggling these settings will update the global default setting for each note. 
        // If you want to enable or disable some of these on single notes, use their corresponding key. 
        // For example will adding 'dg-show-local-graph: false' to the frontmatter of a note, disable the local graph for that particular note. ` });

        new Setting(this.settingsRootElement)
            .setName("Global Note Settings")
            .setDesc(`Default settings for each published note. These can be overwritten per note via frontmatter.`)
            .addButton(cb => {
                cb.setButtonText("Manage note settings");
                cb.onClick(async () => {
                    noteSettingsModal.open();
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show home link (dg-home-link)")
            .setDesc("Determines whether to show a link back to the homepage or not.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgHomeLink)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgHomeLink = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })


        new Setting(noteSettingsModal.contentEl)
            .setName("Show local graph for notes (dg-show-local-graph)")
            .setDesc("When turned on, notes will show its local graph in a sidebar on desktop and at the bottom of the page on mobile.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowLocalGraph)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowLocalGraph = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show backlinks for notes (dg-show-backlinks)")
            .setDesc("When turned on, notes will show backlinks in a sidebar on desktop and at the bottom of the page on mobile.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowBacklinks)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowBacklinks = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show a table of content for notes (dg-show-toc)")
            .setDesc("When turned on, notes will show all headers as a table of content in a sidebar on desktop. It will not be shown on mobile devices.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowToc)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowToc = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show inline title (dg-show-inline-title)")
            .setDesc("When turned on, the title of the note will show on top of the page.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowInlineTitle)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowInlineTitle = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show filetree sidebar (dg-show-file-tree)")
            .setDesc("When turned on, a filetree will be shown on your site.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowFileTree)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowFileTree = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Enable search (dg-enable-search)")
            .setDesc("When turned on, users will be able to search through the content of your site.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgEnableSearch)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgEnableSearch = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Enable link preview (dg-link-preview)")
            .setDesc("When turned on, hovering over links to notes in your garden shows a scrollable preview.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgLinkPreview)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgLinkPreview = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show Tags (dg-show-tags)")
            .setDesc("When turned on, tags in your frontmatter will be displayed on each note. If search is enabled, clicking on a tag will bring up a search for all notes containing that tag.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgShowTags)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgShowTags = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Let all frontmatter through (dg-pass-frontmatter)")
            .setDesc("Determines whether to let all frontmatter data through to the site template. Be aware that this could break your site if you have data in a format not recognized by the template engine, 11ty.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgPassFrontmatter)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgPassFrontmatter = val;
                    this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                })
			})
    }


    private async initializeThemesSettings() {

        const themeModal = new Modal(this.app);
        themeModal.containerEl.addClass("dg-settings");
        themeModal.titleEl.createEl("h1", { text: "Appearance Settings" });

        new Setting(this.settingsRootElement)
            .setName("Appearance")
            .setDesc("Manage themes, sitename and styling on your site")
            .addButton(cb => {
                cb.setButtonText("Manage appearance");
                cb.onClick(async () => {
                    themeModal.open();
                })
            })

        //this.app.plugins is not defined, so we need to use a try catch in case the internal api is changed
        try {
            //@ts-ignore
            if (this.app.plugins && this.app.plugins.plugins['obsidian-style-settings']._loaded) {
                themeModal.contentEl.createEl('h2', { text: "Style Settings Plugin" }).prepend(getIcon('paintbrush'));
                new Setting(themeModal.contentEl)
                    .setName("Apply current style settings to site")
                    .setDesc("Click the apply button to use the current style settings from the Style Settings Plugin on your site.")
                    .addButton(btn => {
                        btn.setButtonText("Apply");
                        btn.onClick(async ev => {
                            new Notice("Applying Style Settings...");
                            const styleSettingsNode = document.querySelector("#css-settings-manager");
                            if(!styleSettingsNode){
                                new Notice("No Style Settings found");
                                return;
                            } 
                            this.settings.styleSettingsCss = styleSettingsNode.innerHTML
                            if(!this.settings.styleSettingsCss) {
                                new Notice("No Style Settings found");
                                return;
                            }
                            this.saveSiteSettingsAndUpdateEnv(this.app.metadataCache, this.settings, this.saveSettings);
                            new Notice("Style Settings applied to site");
                        });
                    });
            }
        } catch { }

        themeModal.contentEl.createEl('h2', { text: "Theme Settings" }).prepend(getIcon('palette'));

        const themesListResponse = await axios.get("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json")
        new Setting(themeModal.contentEl)
            .setName("Theme")
            .addDropdown(dd => {
                dd.addOption('{"name": "default", "modes": ["dark"]}', "Default")
                const sortedThemes = themesListResponse.data.sort((a: { name: string; }, b: { name: any; }) => a.name.localeCompare(b.name));
                sortedThemes.map((x: any) => {
                    dd.addOption(JSON.stringify({ ...x, cssUrl: `https://raw.githubusercontent.com/${x.repo}/${x.branch || 'HEAD'}/${x.legacy ? 'obsidian.css' : 'theme.css'}` }), x.name);
                    dd.setValue(this.settings.theme)
                    dd.onChange(async (val: any) => {
                        this.settings.theme = val;
                        await this.saveSettings();
                    });

                });
            })

        //should get theme settings from env in github, not settings
        new Setting(themeModal.contentEl)
            .setName("Base theme")
            .addDropdown(dd => {
                dd.addOption("dark", "Dark");
                dd.addOption("light", "Light");
                dd.setValue(this.settings.baseTheme)
                dd.onChange(async (val: string) => {
                    this.settings.baseTheme = val;
                    await this.saveSettings();
                });
            });

       

        new Setting(themeModal.contentEl)
            .setName('Sitename')
            .setDesc('The name of your site. This will be displayed as the site header.')
            .addText(text =>
                text.setValue(this.settings.siteName)
                    .onChange(async (value) => {
                        this.settings.siteName = value;
                        await this.saveSettings();
                    })
            );

        new Setting(themeModal.contentEl)
            .setName("Favicon")
            .setDesc("Path to an svg in your vault you wish to use as a favicon. Leave blank to use default.")
            .addText(tc => {
                tc.setPlaceholder("myfavicon.svg")
                tc.setValue(this.settings.faviconPath);
                tc.onChange(async val => {
                    this.settings.faviconPath = val;
                    await this.saveSettings();
                });
                new SvgFileSuggest(this.app, tc.inputEl)
            })

        themeModal.contentEl.createEl('h2', { text: "Timestamps Settings" }).prepend(getIcon('calendar-clock'));
        new Setting(themeModal.contentEl)
            .setName('Timestamp format')
            .setDesc('The format string to render timestamp on the garden. Must be luxon compatible')
            .addText(text =>
                text.setValue(this.settings.timestampFormat)
                    .onChange(async (value) => {
                        this.settings.timestampFormat = value;
                        await this.saveSettings();
                    })
            );
        new Setting(themeModal.contentEl)
            .setName("Show created timestamp")
            .addToggle(t => {
                t.setValue(this.settings.showCreatedTimestamp)
                    .onChange(async (value) => {
                        this.settings.showCreatedTimestamp = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName('Created timestamp Frontmatter Key')
            .setDesc('Key to get the created timestamp from the frontmatter. Keep blank to get the value from file creation time. The value can be any value that luxon Datetime.fromISO can parse.')
            .addText(text =>
                text.setValue(this.settings.createdTimestampKey)
                    .onChange(async (value) => {
                        this.settings.createdTimestampKey = value;
                        await this.saveSettings();
                    })
            );

        new Setting(themeModal.contentEl)
            .setName("Show updated timestamp")
            .addToggle(t => {
                t.setValue(this.settings.showUpdatedTimestamp)
                    .onChange(async (value) => {
                        this.settings.showUpdatedTimestamp = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName('Updated timestamp Frontmatter Key')
            .setDesc('Key to get the updated timestamp from the frontmatter. Keep blank to get the value from file update time. The value can be any value that luxon Datetime.fromISO can parse.')
            .addText(text =>
                text.setValue(this.settings.updatedTimestampKey)
                    .onChange(async (value) => {
                        this.settings.updatedTimestampKey = value;
                        await this.saveSettings();
                    })
		);
		
        themeModal.contentEl.createEl('h2', { text: "CSS settings" }).prepend(getIcon('code'));
		new Setting(themeModal.contentEl)
            .setName('Body Classes Key')
            .setDesc('Key for setting css-classes to the note body from the frontmatter.')
            .addText(text =>
                text.setValue(this.settings.contentClassesKey)
                    .onChange(async (value) => {
                        this.settings.contentClassesKey = value;
                        await this.saveSettings();
                    })
            );


        themeModal.contentEl.createEl('h2', { text: "Note icons Settings" }).prepend(getIcon('image'));
        themeModal.contentEl
            .createEl('div', { attr: { style: "margin-bottom: 10px;" } })
            .createEl('a', {
                text: "Documentation on note icons",
                href: "https://dg-docs.ole.dev/advanced/note-specific-settings/#note-icons"
            });

        new Setting(themeModal.contentEl)
            .setName('Note icon Frontmatter Key')
            .setDesc('Key to get the note icon value from the frontmatter')
            .addText(text =>
                text.setValue(this.settings.noteIconKey)
                    .onChange(async (value) => {
                        this.settings.noteIconKey = value;
                        await this.saveSettings();
                    })
            );

        new Setting(themeModal.contentEl)
            .setName('Default note icon Value')
            .setDesc('The default value for note icon if not specified')
            .addText(text => {
                text.setValue(this.settings.defaultNoteIcon)
                    .onChange(async (value) => {
                        this.settings.defaultNoteIcon = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName("Show note icon on Title")
            .addToggle(t => {
                t.setValue(this.settings.showNoteIconOnTitle)
                    .onChange(async (value) => {
                        this.settings.showNoteIconOnTitle = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName("Show note icon in FileTree")
            .addToggle(t => {
                t.setValue(this.settings.showNoteIconInFileTree)
                    .onChange(async (value) => {
                        this.settings.showNoteIconInFileTree = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName("Show note icon on Internal Links")
            .addToggle(t => {
                t.setValue(this.settings.showNoteIconOnInternalLink)
                    .onChange(async (value) => {
                        this.settings.showNoteIconOnInternalLink = value;
                        await this.saveSettings();
                    })
            });

        new Setting(themeModal.contentEl)
            .setName("Show note icon on Backlinks")
            .addToggle(t => {
                t.setValue(this.settings.showNoteIconOnBackLink)
                    .onChange(async (value) => {
                        this.settings.showNoteIconOnBackLink = value;
                        await this.saveSettings();
                    })
            });


        new Setting(themeModal.contentEl)
            .addButton(cb => {
                cb.setButtonText("Apply settings to site");
                cb.onClick(async ev => {
                    const octokit = new Octokit({ auth: this.settings.githubToken });
                    await this.saveSettingsAndUpdateEnv();
                    await this.addFavicon(octokit);
                });
            })


    }

    private async saveSettingsAndUpdateEnv() {
        const theme = JSON.parse(this.settings.theme);
        const baseTheme = this.settings.baseTheme;
        if (theme.modes.indexOf(baseTheme) < 0) {
            new Notice(`The ${theme.name} theme doesn't support ${baseTheme} mode.`)
            return;
        }
        const gardenManager = new DigitalGardenSiteManager(this.app.metadataCache, this.settings)
        await gardenManager.updateEnv();

        new Notice("Successfully applied settings");
    }

    private async saveSiteSettingsAndUpdateEnv(metadataCache: MetadataCache, settings: DigitalGardenSettings, saveSettings: () => Promise<void>) {
        const octokit = new Octokit({ auth: settings.githubToken });
        let updateFailed = false;
        try {
            const gardenManager = new DigitalGardenSiteManager(metadataCache, settings)
            await gardenManager.updateEnv();
        } catch {
            new Notice("Failed to update settings. Make sure you have an internet connection.")
            updateFailed = true;
        }

        if (!updateFailed) {
            await saveSettings();
        }
    }

    private async addFavicon(octokit: Octokit) {
        let base64SettingsFaviconContent = "";
        if (this.settings.faviconPath) {

            const faviconFile = this.app.vault.getAbstractFileByPath(this.settings.faviconPath);
            if (!(faviconFile instanceof TFile)) {
                new Notice(`${this.settings.faviconPath} is not a valid file.`)
                return;
            }
            const faviconContent = await this.app.vault.readBinary(faviconFile);
            base64SettingsFaviconContent = arrayBufferToBase64(faviconContent);
        }
        else {
            const defaultFavicon = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: "oleeskild",
                repo: "digitalgarden",
                path: "src/site/favicon.svg"
            });
            base64SettingsFaviconContent = defaultFavicon.data.content;
        }

        //The getting and setting sha when putting can be generalized into a utility function
        let faviconExists = true;
        let faviconsAreIdentical = false;
        let currentFaviconOnSite = null;
        try {
            currentFaviconOnSite = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: "src/site/favicon.svg",
            });
            faviconsAreIdentical = (currentFaviconOnSite.data.content.replaceAll("\n", "").replaceAll(" ", "") === base64SettingsFaviconContent)
        } catch (error) {
            faviconExists = false;
        }

        if (!faviconExists || !faviconsAreIdentical) {
            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: "src/site/favicon.svg",
                message: `Update favicon.svg`,
                content: base64SettingsFaviconContent,
                sha: faviconExists ? currentFaviconOnSite.data.sha : null
            });

        }

    }
    private initializeGitHubRepoSetting() {
        new Setting(this.settingsRootElement)
            .setName('GitHub repo name')
            .setDesc('The name of the GitHub repository')
            .addText(text => text
                .setPlaceholder('mydigitalgarden')
                .setValue(this.settings.githubRepo)
                .onChange(async (value) => {
                    this.settings.githubRepo = value;
                    await this.saveSettings();
                }));

    }

    private initializeGitHubUserNameSetting() {
        new Setting(this.settingsRootElement)
            .setName('GitHub Username')
            .setDesc('Your GitHub Username')
            .addText(text => text
                .setPlaceholder('myusername')
                .setValue(this.settings.githubUserName)
                .onChange(async (value) => {
                    this.settings.githubUserName = value;
                    await this.saveSettings();
                }));

    }

    private initializeGitHubTokenSetting() {
        const desc = document.createDocumentFragment();
        desc.createEl("span", null, (span) => {
            span.innerText =
                "A GitHub token with repo permissions. You can generate it ";
            span.createEl("a", null, (link) => {
                link.href = "https://github.com/settings/tokens/new?scopes=repo";
                link.innerText = "here!";
            });
        });

        new Setting(this.settingsRootElement)
            .setName('GitHub token')
            .setDesc(desc)
            .addText(text => text
                .setPlaceholder('Secret Token')
                .setValue(this.settings.githubToken)
                .onChange(async (value) => {
                    this.settings.githubToken = value;
                    await this.saveSettings();
                }));

    }



    private initializeGitHubBaseURLSetting() {
        new Setting(this.settingsRootElement)
            .setName('Base URL')
            .setDesc(`
            This is optional, but recommended. It is used for the "Copy Garden URL" command, generating a sitemap.xml for better SEO and an RSS feed located at /feed.xml. 
            `)
            .addText(text => text
                .setPlaceholder('https://my-garden.vercel.app')
                .setValue(this.settings.gardenBaseUrl)
                .onChange(async (value) => {
                    this.settings.gardenBaseUrl = value;
                    this.debouncedSaveAndUpdate(this.app.metadataCache, this.settings, this.saveSettings);
                }));
    }

    private initializeSlugifySetting() {
        new Setting(this.settingsRootElement)
            .setName('Slugify Note URL')
            .setDesc('Transform the URL from "/My Folder/My Note/" to "/my-folder/my-note". If your note titles contains non-English characters, this should be disabled.')
            .addToggle(toggle =>
                toggle.setValue(this.settings.slugifyEnabled)
                    .onChange(async (value) => {
                        this.settings.slugifyEnabled = value;
                        await this.saveSettings();
                    })
            );
	}
	
	private initializePathRewriteSettings() {

        const rewriteRulesModal = new Modal(this.app);
        rewriteRulesModal.titleEl.createEl("h1", {text: "Path Rewrite Rules"})
        rewriteRulesModal.modalEl.style.width = "fit-content";

        new Setting(this.settingsRootElement)
            .setName('Path Rewrite Rules')
            .setDesc('Define rules to rewrite note folder structure in the garden. See the modal for more information.')
            .addButton(cb=>{
                cb.setButtonText("Manage Rewrite Rules")
                cb.onClick(()=>{
                    rewriteRulesModal.open();
                }) 
            })

        const rewritesettingContainer = rewriteRulesModal.contentEl.createEl('div', { attr: { class: "", style: "align-items:flex-start; flex-direction: column;" } });

		rewritesettingContainer.createEl('div', {text: `Define rules to rewrite note paths/folder structure, using following syntax:`})

        const list = rewritesettingContainer.createEl('ol');
        list.createEl("li", {text: `One rule-per line`})
        list.createEl("li", {text: `The format is [from_vault_path]:[to_garden_path]`})
        list.createEl("li", {text: `Matching will exit on first match`});
        rewritesettingContainer.createEl("div", {text: `Example: If you want the vault folder "Personal/Journal" to be shown as only "Journal" in the left file sidebar in the garden, add the line "Personal/Journal:Journal"`, attr: { class: "setting-item-description" }})
		rewritesettingContainer.createEl("div", { text: `Note: rewriting a folder to the base path "[from_vault_path]:" is not supported at the moment.`, attr: { class: "setting-item-description" } })
        rewritesettingContainer.createEl("div", {text: `Any affected notes will show up as changed in the publication center`, attr: { class: "setting-item-description" }})



        new Setting(rewritesettingContainer)
            .setName('Rules')
			.addTextArea(field => {
				field.setPlaceholder('Personal/Journal:Journal')
                field.inputEl.rows = 5;
                field.inputEl.cols = 100;
				field.setValue(this.settings.pathRewriteRules)
                    .onChange(async (value) => {
                        this.settings.pathRewriteRules = value;
						await this.saveSettings()

                    })
			}
		);	

		rewritesettingContainer.createEl("div", { text: `Type a path below to test that your rules are working as expected`, attr: { class: "test-rewrite-rules-description" } })

		const rewriteSettingsPreviewContainer = rewritesettingContainer.createEl('div', { attr: { style: 'display: flex; align-items: center; margin-top: 10px;' } });

		const previewInput = rewriteSettingsPreviewContainer.createEl('input', { attr: { type: 'text', placeholder: 'type a vault path', style: 'margin-right: 10px;' } });

		previewInput.addEventListener('input', () => {
			const testPath = previewInput.value;
			const rewriteTestResult = getGardenPathForNote(testPath, getRewriteRules(this.settings.pathRewriteRules));
			testResultDiv.innerHTML = `Garden path: "${rewriteTestResult}"`;
		});

		const testResultDiv = rewriteSettingsPreviewContainer.createEl("div", { text: `Garden path: ""`, attr: { class: "test-rewrite-rules-new-path" } });



    }

    private initializeCustomFilterSettings() {

        const customFilterModal = new Modal(this.app);
        customFilterModal.titleEl.createEl("h1", {text: "Custom Filters"})
        customFilterModal.modalEl.style.width = "fit-content";

        new Setting(this.settingsRootElement)
            .setName('Custom Filters')
            .setDesc('Define custom rules to replace parts of the note before publishing.')
            .addButton(cb=>{
                cb.setButtonText("Manage Custom Filters")
                cb.onClick(()=>{
                    customFilterModal.open();
                }) 
            })

        const rewritesettingContainer = customFilterModal.contentEl.createEl('div', { attr: { class: "", style: "align-items:flex-start; flex-direction: column; margin: 5px;" } });
		rewritesettingContainer.createEl('div').innerHTML = `Define regex filters to replace note content before publishing.`;
        rewritesettingContainer.createEl('div', {attr: { class: "setting-item-description" }}).innerHTML = `Format: [<code>regex pattern</code>, <code>replacement</code>, <code>regex flags</code>]`;
        rewritesettingContainer.createEl('div', {attr: { class: "setting-item-description", style:"margin-bottom: 15px" }}).innerHTML = `Example: filter [<code>:smile:</code>, <code>😀</code>, <code>g</code>] will replace text with real emojis`;

        const customFilters = this.settings.customFilters;
        new Setting(rewritesettingContainer)
            .setName('Filters')
            .addButton((button) => {
                button.setButtonText("Add");
                button.setTooltip("Add a filter");
                button.setIcon('plus');
                button.onClick(async () => {
                    const customFilters = this.settings.customFilters;
                    customFilters.push({pattern: '', flags: 'g', replace: ''});
                    filterList.empty();
                    for(let i = 0; i < customFilters.length; i++) {
                        addFilterInput(customFilters[i], filterList, i, this);
                    }
                });
            });
        const filterList = rewritesettingContainer.createDiv('custom-filter-list');
        for(let i = 0; i < customFilters.length; i++) {
            addFilterInput(customFilters[i], filterList, i, this);
        }
    }

    renderCreatePr(modal: Modal, handlePR: (button: ButtonComponent) => Promise<void>) {

		this.settingsRootElement.createEl('h3', { text: "Update site" }).prepend(getIcon("sync"));
        new Setting(this.settingsRootElement)
            .setName("Site Template")
            .setDesc("Manage updates to the base template. You should try updating the template when you update the plugin to make sure your garden support all features.")
            .addButton(button => {
                button.setButtonText("Manage site template")
                button.onClick(() => {
                    modal.open();
                })
            })
		modal.titleEl.createEl('h2', { text: "Update site" });
        new Setting(modal.contentEl)
            .setName('Update site to latest template')
            .setDesc(`
				This will create a pull request with the latest template changes, which you'll need to use all plugin features. 
				It will not publish any changes before you approve them.
			`)
            .addButton(button => button
                .setButtonText('Create PR')
                .onClick(() => handlePR(button)));

        if (!this.progressViewTop) {
            this.progressViewTop = modal.contentEl.createEl('div', {});
        }
        if (!this.loading) {
            this.loading = modal.contentEl.createEl('div', {});
            this.loading.hide();
        }


        this.settingsRootElement.createEl('h3', { text: "Support" }).prepend(getIcon("heart"));
        this.settingsRootElement.createDiv({ attr: { style: "display:flex; align-items:center; justify-content:center; margin-top: 20px;" } }).createEl("a", { attr: { href: "https://ko-fi.com/oleeskild", target: "_blank" } }).createEl("img", { attr: { src: "https://cdn.ko-fi.com/cdn/kofi3.png?v=3", width: "200" } })
    }

    renderPullRequestHistory(modal: Modal, previousPrUrls: string[]) {
        if (previousPrUrls.length === 0) {
            return;
        }
        const header = modal.contentEl.createEl('h2', { text: '➕ Recent Pull Request History' })
        const prsContainer = modal.contentEl.createEl('ul', {});
        prsContainer.hide();
        header.onClickEvent(() => {
            if (prsContainer.isShown()) {
                prsContainer.hide();
                header.textContent = "➕  Recent Pull Request History";
            } else {
                prsContainer.show();
                header.textContent = "➖ Recent Pull Request History";
            }
        })
        previousPrUrls.map(prUrl => {
            const li = prsContainer.createEl('li', { attr: { 'style': 'margin-bottom: 10px' } });
            const prUrlElement = document.createElement('a');
            prUrlElement.href = prUrl;
            prUrlElement.textContent = prUrl;
            li.appendChild(prUrlElement);
        });
    }

    renderLoading() {
        this.loading.show();
        const text = "Creating PR. This should take about 30-60 seconds";
        const loadingText = this.loading.createEl('h4', { text });
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
        }, 400)
    }

    renderSuccess(prUrl: string) {
        this.loading.remove();
        clearInterval(this.loadingInterval);

        const successmessage = prUrl ?
            { text: `🎉 Done! Approve your PR to make the changes go live.` } :
            { text: "You already have the latest template 🎉 No need to create a PR.", attr: {} };
        const linkText = { text: `${prUrl}`, href: prUrl };
        this.progressViewTop.createEl('h2', successmessage);
        if (prUrl) {
            this.progressViewTop.createEl('a', linkText);
        }
        this.progressViewTop.createEl('br');
    }

    renderError() {
        this.loading.remove();
        clearInterval(this.loadingInterval);
        const errorMsg = { text: '❌ Something went wrong. Try deleting the branch in GitHub.', attr: {} };
        this.progressViewTop.createEl('p', errorMsg);
    }
}
