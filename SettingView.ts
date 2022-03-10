import DigitalGardenSettings from 'DigitalGardenSettings';
import { ButtonComponent, Setting } from 'obsidian';

export default class SettingView {
    private settings: DigitalGardenSettings;
    private saveSettings: () => Promise<void>;
    private settingsRootElement: HTMLElement;
    private previousPrsViewTop: HTMLElement;
    private progressViewTop: HTMLElement;
    private updateTemplateTop: HTMLElement;
    private loading: HTMLElement;
    private loadingInterval: any;

    constructor(settingsRootElement: HTMLElement, settings: DigitalGardenSettings, saveSettings: () => Promise<void>) {
        this.settingsRootElement = settingsRootElement;
        this.settings = settings;
        this.saveSettings = saveSettings;
        this.initialize();
    }

    private initialize() {
        this.settingsRootElement.empty();
        this.settingsRootElement.createEl('h2', { text: 'Settings ' });
        this.settingsRootElement.createEl('span', { text: 'Remember to read the setup guide if you haven\'t already. It can be found ' });
        this.settingsRootElement.createEl('a', { text: 'here.', href: "https://github.com/oleeskild/Obsidian-Digital-Garden" });


        this.initializeGitHubRepoSetting();
        this.initializeGitHubUserNameSetting();
        this.initializeGitHubTokenSetting();
        this.initializeGitHubBaseURLSetting();

        this.updateTemplateTop = this.settingsRootElement.createEl('div', {cls: 'setting-item'});
        this.progressViewTop = this.settingsRootElement.createEl('div', {});
        this.previousPrsViewTop = this.settingsRootElement.createEl('div', {cls: 'setting-item'});
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
            This is used for the "Copy Note URL" command and is optional. 
            If you leave it blank, the plugin will try to guess it from the repo name.
            `)
            .addText(text => text
                .setPlaceholder('my-digital-garden.netlify.app')
                .setValue(this.settings.gardenBaseUrl)
                .onChange(async (value) => {
                    this.settings.gardenBaseUrl = value;
                    await this.saveSettings();
                }));
    }

    renderCreatePr(handlePR: (button: ButtonComponent) => Promise<void>){
        new Setting(this.updateTemplateTop)
			.setName('Update site to latest template')
			.setDesc(`
				This will create a pull request with the latest template changes. 
				It will not publish any changes before you approve them.
				You can even test the changes first Netlify will automatically provide you with a test URL.
			`)
			.addButton(button => button
				.setButtonText('Create PR')
				.onClick(()=>handlePR(button)));

    }

    renderPullRequestHistory(previousPrUrls: string[]) {
        if (previousPrUrls.length === 0) {
            return;
        }
        this.previousPrsViewTop.createEl('h2', { text: 'Recent Pull Request History' })
        const prsContainer = this.previousPrsViewTop.createEl('ul', {});
        previousPrUrls.map(prUrl => {
            const li = prsContainer.createEl('li', {attr: {'style': 'margin-bottom: 10px'}});
            const prUrlElement = document.createElement('a');
            prUrlElement.href = prUrl;
            prUrlElement.textContent = prUrl;
            li.appendChild(prUrlElement);
            this.settingsRootElement.appendChild(li);
        });
    };

    renderLoading() {
        this.loading = this.progressViewTop.createEl('div', {});
        this.loading.createEl('p', { text: 'Creating PR. This should take less than 1 minute' });
        const loadingText = this.loading.createEl('p', { text: 'Loading' });
        this.loadingInterval = setInterval(() => {
            if (loadingText.innerText === 'Loading') {
                loadingText.innerText = 'Loading.';
            } else if (loadingText.innerText === 'Loading.') {
                loadingText.innerText = 'Loading..';
            } else if (loadingText.innerText === 'Loading..') {
                loadingText.innerText = 'Loading...';
            } else {
                loadingText.innerText = 'Loading';
            }
        }, 400)
    }

    renderSuccess(prUrl: string) {
        this.loading.remove();
        this.loading = null;
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
        this.loading = null;
        clearInterval(this.loadingInterval);
        const errorMsg = { text: '❌ Something went wrong. Try deleting the branch in GitHub.', attr: {} };
        this.progressViewTop.createEl('p', errorMsg);
    }
}