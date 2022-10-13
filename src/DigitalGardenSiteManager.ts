import DigitalGardenSettings from "src/DigitalGardenSettings";
import { MetadataCache, TFile } from "obsidian";
import { extractBaseUrl, generateUrlPath } from "./utils";
import { Octokit } from "@octokit/core";

export interface IDigitalGardenSiteManager {
    getNoteUrl(file: TFile): string;
    getNoteHashes(): Promise<{ [key: string]: string }>;
    createPullRequestWithSiteChanges(): Promise<string>;
}
export default class DigitalGardenSiteManager implements IDigitalGardenSiteManager {
    settings: DigitalGardenSettings;
    metadataCache: MetadataCache;
    constructor(metadataCache: MetadataCache, settings: DigitalGardenSettings) {
        this.settings = settings;
        this.metadataCache = metadataCache;
    }

    getNoteUrl(file: TFile): string {
        const baseUrl = this.settings.gardenBaseUrl ?
            `https://${extractBaseUrl(this.settings.gardenBaseUrl)}`
            : `https://${this.settings.githubRepo}.netlify.app`;


        const noteUrlPath = generateUrlPath(file.path);

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
            tree_sha: 'main'
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
        const branchName = "update-template-to-v" + templateVersion;

        const latestCommit = await octokit.request('GET /repos/{owner}/{repo}/commits/main', {
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
            const pr = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                title: `Update template to version ${templateVersion}`,
                head: branchName,
                base: "main",
                body: `Update to latest template version.\n [Release Notes](https://github.com/oleeskild/digitalgarden/releases/tag/${templateVersion})`
            });

            return pr.data.html_url;
        } catch {
            //The PR failed, most likely the repo is the latest version
            return null;
        }


    }
    private async deleteFiles(octokit: Octokit, branchName: string) {
        const filesToDelete = [
            "src/site/styles/style.css",
        ];

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
        const filesToModify = [
            ".eleventy.js",
            "README.md",
            "netlify.toml",
            "package-lock.json",
            "package.json",
            "src/site/404.njk",
            "src/site/index.njk",
            "src/site/index.11tydata.js",
            "src/site/versionednote.njk",
            "src/site/styles/style.scss",
            "src/site/styles/digital-garden-base.scss",
            "src/site/styles/obsidian-base.scss",
            "src/site/notes/notes.json",
            "src/site/notes/notes.11tydata.js",
            "src/site/_includes/layouts/note.njk",
            "src/site/_includes/layouts/versionednote.njk",
            "src/site/_includes/components/notegrowthhistory.njk",
            "src/site/_includes/components/pageheader.njk",
            "src/site/_includes/components/sidebar.njk",
            "src/site/_includes/components/graphScript.njk",
            "src/site/_data/versionednotes.js",
            "src/site/_data/meta.js",
            "src/site/img/outgoing.svg"
        ];

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
        const filesToAdd = [
            "src/site/styles/custom-style.scss",
            ".env",
            "src/site/favicon.svg",
        ]

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
}