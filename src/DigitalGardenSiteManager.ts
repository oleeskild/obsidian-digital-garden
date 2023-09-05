import DigitalGardenSettings from "src/DigitalGardenSettings";
import { MetadataCache, Notice, TFile } from "obsidian";
import { extractBaseUrl, generateUrlPath, getGardenPathForNote, getRewriteRules } from "./utils";
import { Octokit } from "@octokit/core";
import { Base64 } from 'js-base64';
import DigitalGardenPluginInfo from "./DigitalGardenPluginInfo";

export interface IDigitalGardenSiteManager {
    getNoteUrl(file: TFile): string;
    getNoteHashes(): Promise<{ [key: string]: string }>;
	getImageHashes(): Promise<{ [key: string]: string }>;
    createPullRequestWithSiteChanges(): Promise<string>;
}

export type PathRewriteRule = {
	from: string,
	to: string
}
export type PathRewriteRules = Array<PathRewriteRule>;

export default class DigitalGardenSiteManager implements IDigitalGardenSiteManager {
    settings: DigitalGardenSettings;
	metadataCache: MetadataCache;
	rewriteRules: PathRewriteRules;
    constructor(metadataCache: MetadataCache, settings: DigitalGardenSettings) {
        this.settings = settings;
		this.metadataCache = metadataCache;
		this.rewriteRules = getRewriteRules(settings.pathRewriteRules);
    }

    async updateEnv() {
        const octokit = new Octokit({ auth: this.settings.githubToken });
        const theme = JSON.parse(this.settings.theme);
        const baseTheme = this.settings.baseTheme;
        const siteName = this.settings.siteName;
        let gardenBaseUrl = ''

        //check that gardenbaseurl is not an access token wrongly pasted.
        if (this.settings.gardenBaseUrl 
            && !this.settings.gardenBaseUrl.startsWith("ghp_") 
            && !this.settings.gardenBaseUrl.startsWith("github_pat")
            && this.settings.gardenBaseUrl.contains(".")) {
            gardenBaseUrl = this.settings.gardenBaseUrl;
        }

        let envSettings = '';
        if (theme.name !== 'default') {
            envSettings = `THEME=${theme.cssUrl}\nBASE_THEME=${baseTheme}`;
        }
        envSettings+=`\nSITE_NAME_HEADER=${siteName}`;
		envSettings += `\nSITE_BASE_URL=${gardenBaseUrl}`;
		envSettings += `\nSHOW_CREATED_TIMESTAMP=${this.settings.showCreatedTimestamp}`;
		envSettings += `\nTIMESTAMP_FORMAT=${this.settings.timestampFormat}`;
		envSettings += `\nSHOW_UPDATED_TIMESTAMP=${this.settings.showUpdatedTimestamp}`;
		envSettings += `\nNOTE_ICON_DEFAULT=${this.settings.defaultNoteIcon}`;
		envSettings += `\nNOTE_ICON_TITLE=${this.settings.showNoteIconOnTitle}`;
		envSettings += `\nNOTE_ICON_FILETREE=${this.settings.showNoteIconInFileTree}`;
		envSettings+=`\nNOTE_ICON_INTERNAL_LINKS=${this.settings.showNoteIconOnInternalLink}`;
		envSettings+=`\nNOTE_ICON_BACK_LINKS=${this.settings.showNoteIconOnBackLink}`;
		envSettings+=`\nSTYLE_SETTINGS_CSS=\"${this.settings.styleSettingsCss}\"`;

        const defaultNoteSettings = {...this.settings.defaultNoteSettings};
        for(const key of Object.keys(defaultNoteSettings)) {
                //@ts-ignore
                envSettings += `\n${key}=${defaultNoteSettings[key]}`;
        }

        const base64Settings = Base64.encode(envSettings);

        let fileExists = true;
        let currentFile = null;
        try {
            currentFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: ".env",
            });
        } catch (error) {
            fileExists = false;
        }

        //commit
        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path: ".env",
            message: `Update settings`,
            content: base64Settings,
            sha: fileExists ? currentFile.data.sha : null
        });
    }    

    getNoteUrl(file: TFile): string {
        if(!this.settings.gardenBaseUrl){
            new Notice("Please set the garden base url in the settings")
            return;
        }
        const baseUrl = `https://${extractBaseUrl(this.settings.gardenBaseUrl)}`;


        const noteUrlPath = generateUrlPath(getGardenPathForNote(file.path, this.rewriteRules), this.settings.slugifyEnabled);

        let urlPath = `/${noteUrlPath}`;

        const frontMatter = this.metadataCache.getCache(file.path).frontmatter;

        if (frontMatter && frontMatter["dg-home"] === true) {
            urlPath = "/";
        } else if (frontMatter && frontMatter.permalink) {
            urlPath = `/${frontMatter.permalink}`;
        } else if (frontMatter && frontMatter["dg-permalink"]) {
            urlPath = `/${frontMatter["dg-permalink"]}`;
        }

        return `${baseUrl}${urlPath}`;

    }
	

    async getNoteHashes(): Promise<{ [key: string]: string }> {
        const octokit = new Octokit({ auth: this.settings.githubToken });
        //Force the cache to be updated
        const response = await octokit.request(`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=${Math.ceil(Math.random() * 1000)}`, {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            tree_sha: 'HEAD'
        });

        const files = response.data.tree;
        const notes: Array<{ path: string, sha: string }> = files.filter(
            (x: { path: string; type: string; }) => x.path.startsWith("src/site/notes/") && x.type === "blob" && x.path !== "src/site/notes/notes.json");
        const hashes: { [key: string]: string } = {};
        for (const note of notes) {
            const vaultPath = note.path.replace("src/site/notes/", "");
            hashes[vaultPath] = note.sha;
        }
        return hashes;
    }

	async getImageHashes(): Promise<{ [key: string]: string }> {
        const octokit = new Octokit({ auth: this.settings.githubToken });
        //Force the cache to be updated
        const response = await octokit.request(`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=${Math.ceil(Math.random() * 1000)}`, {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            tree_sha: 'HEAD'
        });

        const files = response.data.tree;
        const images: Array<{ path: string, sha: string }> = files.filter(
            (x: { path: string; type: string; }) => x.path.startsWith("src/site/img/user/") && x.type === "blob");
        const hashes: { [key: string]: string } = {};
        for (const img of images) {
            const vaultPath = decodeURI(img.path.replace("src/site/img/user/", ""));
            hashes[vaultPath] = img.sha;
        }
        return hashes;
    }

    /**
     * 
     * @returns {Promise<string>} The url of the created PR. Null if unable to create PR.
     */
    async createPullRequestWithSiteChanges(): Promise<string> {
        const octokit = new Octokit({ auth: this.settings.githubToken });
        const latestRelease = await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
            owner: "oleeskild",
            repo: "digitalgarden",
        });

        const templateVersion = latestRelease.data.tag_name;
        const uuid = crypto.randomUUID();
        const branchName = "update-template-to-v" + templateVersion+"-"+uuid;

        const latestCommit = await octokit.request('GET /repos/{owner}/{repo}/commits/HEAD', {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
        });

        await this.createNewBranch(octokit, branchName, latestCommit.data.sha);
        await this.deleteFiles(octokit, branchName);
        await this.addFilesIfMissing(octokit, branchName);
        await this.modifyFiles(octokit, branchName);

        const prUrl = await this.createPullRequest(octokit, branchName, templateVersion);
        return prUrl;
    }

    private async createPullRequest(octokit: Octokit, branchName: string, templateVersion: string): Promise<string> {
        try {
            const repoInfo = await octokit.request('GET /repos/{owner}/{repo}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
            });

            const defaultBranch = repoInfo.data.default_branch;
            
            const pr = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                title: `Update template to version ${templateVersion}`,
                head: branchName,
                base: defaultBranch,
                body: `Update to latest template version.\n [Release Notes](https://github.com/oleeskild/digitalgarden/releases/tag/${templateVersion})`
            });

            return pr.data.html_url;
        } catch {
            //The PR failed, most likely the repo is the latest version
            return null;
        }


    }
    private async deleteFiles(octokit: Octokit, branchName: string) {
        const pluginInfo = await this.getPluginInfo(octokit);

        const filesToDelete  =  pluginInfo.filesToDelete;        

        for (const file of filesToDelete) {
            try {
                const latestFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: file,
                    ref: branchName
                });
                await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: file,
                    sha: latestFile.data.sha,
                    message: `Delete ${file}`,
                    branch: branchName
                });
            } catch (e) {
                //Ignore if the file doesn't exist
            }
        }
    }

    private async modifyFiles(octokit: Octokit, branchName: string) {
        const pluginInfo = await this.getPluginInfo(octokit);
        const filesToModify =  pluginInfo.filesToModify;

        for (const file of filesToModify) {
            //get from my repo
            const latestFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: "oleeskild",
                repo: "digitalgarden",
                path: file,
            });

            let currentFile = {};
            let fileExists = true;
            try {
                currentFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: file,
                    ref: branchName
                });
            } catch (error) {
                fileExists = false;
            }


            const fileHasChanged = latestFile.data.sha !== currentFile?.data?.sha;
            if (!fileExists || fileHasChanged) {
                //commit
                await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: file,
                    branch: branchName,
                    message: `Update file ${file}`,
                    content: latestFile.data.content,
                    sha: fileExists ? currentFile.data.sha : null
                });
            }
        }
    }
    private async createNewBranch(octokit: Octokit, branchName: string, sha: any) {
        try {
            const branch = await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                ref: `refs/heads/${branchName}`,
                sha: sha
            });
        } catch (e) {
            //Ignore if the branch already exists
        }
    }

    private async addFilesIfMissing(octokit: Octokit, branchName: string) {
        //Should only be added if it does not exist yet. Otherwise leave it alone

        const pluginInfo = await this.getPluginInfo(octokit);
        const filesToAdd =  pluginInfo.filesToAdd;

        for (const filePath of filesToAdd) {

            try {
                await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: filePath,
                    ref: branchName
                });
            } catch {
                //Doesn't exist
                const initialFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: "oleeskild",
                    repo: "digitalgarden",
                    path: filePath,
                });

                await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                    owner: this.settings.githubUserName,
                    repo: this.settings.githubRepo,
                    path: filePath,
                    branch: branchName,
                    message: "Update template file",
                    content: initialFile.data.content,
                });
            }
        }
    }

    private async getPluginInfo(octokit: Octokit): Promise<DigitalGardenPluginInfo>{
        const pluginInfoResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: "oleeskild",
            repo: "digitalgarden",
            path: "plugin-info.json",
        });        

        const pluginInfo = JSON.parse(Base64.decode(pluginInfoResponse.data.content));
        return pluginInfo as DigitalGardenPluginInfo;
    }
}
