import { DateTime } from 'luxon';
import { MetadataCache, TFile, Vault, Notice, getLinkpath, Component } from "obsidian";
import DigitalGardenSettings from "src/DigitalGardenSettings";
import { Base64 } from "js-base64";
import { Octokit } from "@octokit/core";
import { arrayBufferToBase64, escapeRegExp, generateUrlPath, getGardenPathForNote, getRewriteRules, kebabize, fixSvgForXmlSerializer } from "./utils";
import { vallidatePublishFrontmatter } from "./Validator";
import { excaliDrawBundle, excalidraw } from "./constants";
import { getAPI } from "obsidian-dataview";
import slugify from "@sindresorhus/slugify";
import LZString from "lz-string";
import ObsidianFrontMatterEngine from './ObsidianFrontMatterEngine';

export interface MarkedForPublishing {
    notes: TFile[],
    images: string[]
}
export interface IPublisher {
    [x: string]: any;
    publish(file: TFile): Promise<boolean>;
    delete(vaultFilePath: string): Promise<boolean>;
    getFilesMarkedForPublishing(): Promise<MarkedForPublishing>;
    generateMarkdown(file: TFile): Promise<[string, any]>;
}
export default class Publisher {
    vault: Vault;
    metadataCache: MetadataCache;
    settings: DigitalGardenSettings;
    rewriteRules: Array<Array<string>>;
    customFilters: Array<Object>;
    frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;

    codeFenceRegex = /`(.*?)`/g;
    codeBlockRegex = /```.*?\n[\s\S]+?```/g;
    excaliDrawRegex = /:\[\[(\d*?,\d*?)\],.*?\]\]/g;

    constructor(vault: Vault, metadataCache: MetadataCache, settings: DigitalGardenSettings) {
        this.vault = vault;
        this.metadataCache = metadataCache;
        this.settings = settings;
        this.rewriteRules = getRewriteRules(settings.pathRewriteRules);
    }




    async getFilesMarkedForPublishing(): Promise<MarkedForPublishing> {
        const files = this.vault.getMarkdownFiles();
        const notesToPublish = [];
        const imagesToPublish: Set<string> = new Set();
        for (const file of files) {
            try {
                const frontMatter = this.metadataCache.getCache(file.path).frontmatter
                if (frontMatter && frontMatter["dg-publish"] === true) {
                    notesToPublish.push(file);
                    const images = await this.extractImageLinks(await this.vault.cachedRead(file), file.path);
                    images.forEach((i) => imagesToPublish.add(i));
                }
            } catch {
                //ignore
            }
        }

        return {
            notes: notesToPublish,
            images: Array.from(imagesToPublish)
        };
    }

    async deleteNote(vaultFilePath: string) {
        const path = `src/site/notes/${vaultFilePath}`;
        return await this.delete(path);
    }

    async deleteImage(vaultFilePath: string) {
        const path = `src/site/img/user/${encodeURI(vaultFilePath)}`;
        return await this.delete(path);
    }

    async delete(path: string): Promise<boolean> {
        if (!this.settings.githubRepo) {
            new Notice("Config error: You need to define a GitHub repo in the plugin settings");
            throw {};
        }
        if (!this.settings.githubUserName) {
            new Notice("Config error: You need to define a GitHub Username in the plugin settings");
            throw {};
        }
        if (!this.settings.githubToken) {
            new Notice("Config error: You need to define a GitHub Token in the plugin settings");
            throw {};
        }

        const octokit = new Octokit({ auth: this.settings.githubToken });


        const payload = {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path,
            message: `Delete content ${path}`,
            sha: ''
        };

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path
            });
            if (response.status === 200 && response.data.type === "file") {
                payload.sha = response.data.sha;
            }
        } catch (e) {
            console.log(e)
            return false;
        }



        try {
            const response = await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', payload);
        } catch (e) {
            console.log(e)
            return false
        }
        return true;
    }


    async publish(file: TFile): Promise<boolean> {
        if (!vallidatePublishFrontmatter(this.metadataCache.getCache(file.path).frontmatter)) {
            return false;
        }
        try {
            const [text, assets] = await this.generateMarkdown(file);
            await this.uploadText(file.path, text);
            await this.uploadAssets(assets);
            return true;
        } catch {
            return false;
        }
    }

    async generateMarkdown(file: TFile): Promise<[string, any]> {
        this.rewriteRules = getRewriteRules(this.settings.pathRewriteRules);

        const assets: any = { images: [] };
        if (file.name.endsWith(".excalidraw.md")) {
            return [await this.generateExcalidrawMarkdown(file, true), assets];
        }

        let text = await this.vault.cachedRead(file);
        text = await this.convertCustomFilters(text);
        text = await this.convertFrontMatter(text, file);
        text = await this.createBlockIDs(text);
        text = await this.createTranscludedText(text, file.path, 0);
        text = await this.convertDataViews(text, file.path);
        text = await this.convertLinksToFullPath(text, file.path);
        text = await this.removeObsidianComments(text);
        text = await this.createSvgEmbeds(text, file.path);
        const text_and_images = await this.convertImageLinks(text, file.path);
        assets.images = text_and_images[1];
        return [text_and_images[0], assets];
    }

    async convertCustomFilters(text: string) {
        for (const filter of this.settings.customFilters) {
            text = text.replace(RegExp(filter.pattern, filter.flags), filter.replace);
        }
        return text
    }

    async createBlockIDs(text: string) {
        const block_pattern = / \^([\w\d-]+)/g;
        const complex_block_pattern = /\n\^([\w\d-]+)\n/g;
        text = text.replace(complex_block_pattern, (match: string, $1: string) => {
            return `{ #${$1}}\n\n`;
        });
        text = text.replace(block_pattern, (match: string, $1: string) => {
            return `\n{ #${$1}}\n`;
        });
        return text;
    }

    async uploadToGithub(path: string, content: string) {
        if (!this.settings.githubRepo) {
            new Notice("Config error: You need to define a GitHub repo in the plugin settings");
            throw {};
        }
        if (!this.settings.githubUserName) {
            new Notice("Config error: You need to define a GitHub Username in the plugin settings");
            throw {};
        }
        if (!this.settings.githubToken) {
            new Notice("Config error: You need to define a GitHub Token in the plugin settings");
            throw {};
        }


        const octokit = new Octokit({ auth: this.settings.githubToken });


        const payload = {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path,
            message: `Add content ${path}`,
            content,
            sha: ''
        };

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path
            });
            if (response.status === 200 && response.data.type === "file") {
                payload.sha = response.data.sha;
            }
        } catch (e) {
            console.log(e)
        }

        payload.message = `Update content ${path}`;

        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', payload);

    }

    async uploadText(filePath: string, content: string) {
        content = Base64.encode(content);
        const path = `src/site/notes/${filePath}`
        await this.uploadToGithub(path, content)
    }

    async uploadImage(filePath: string, content: string) {
        const path = `src/site${filePath}`
        await this.uploadToGithub(path, content)
    }

    async uploadAssets(assets: any) {
        for (let idx = 0; idx < assets.images.length; idx++) {
            const image = assets.images[idx];
            await this.uploadImage(image.path, image.content);

        }
    }

    stripAwayCodeFencesAndFrontmatter(text: string): string {
        let textToBeProcessed = text;
        textToBeProcessed = textToBeProcessed.replace(this.excaliDrawRegex, '');
        textToBeProcessed = textToBeProcessed.replace(this.codeBlockRegex, '');
        textToBeProcessed = textToBeProcessed.replace(this.codeFenceRegex, '');
        textToBeProcessed = textToBeProcessed.replace(this.frontmatterRegex, '');

        return textToBeProcessed;

    }

    async removeObsidianComments(text: string): Promise<string> {
        const obsidianCommentsRegex = /%%.+?%%/gms;
        const obsidianCommentsMatches = text.match(obsidianCommentsRegex);
        const codeBlocks = text.match(this.codeBlockRegex) || [];
        const codeFences = text.match(this.codeFenceRegex) || [];
        const excalidraw = text.match(this.excaliDrawRegex) || [];

        if (obsidianCommentsMatches) {
            for (const commentMatch of obsidianCommentsMatches) {
                //If comment is in a code block, code fence, or excalidrawing, leave it in
                if (codeBlocks.findIndex(x => x.contains(commentMatch)) > -1) {
                    continue;
                }
                if (codeFences.findIndex(x => x.contains(commentMatch)) > -1) {
                    continue;
                }

                if (excalidraw.findIndex(x => x.contains(commentMatch)) > -1) {
                    continue;
                }
                text = text.replace(commentMatch, '');
            }
        }

        return text;
    }

    async convertFrontMatter(text: string, file: TFile): Promise<string> {
        const publishedFrontMatter = this.getProcessedFrontMatter(file);
        const replaced = text.replace(this.frontmatterRegex, (match, p1) => {
            return publishedFrontMatter;
        });
        return replaced;
    }

    async convertDataViews(text: string, path: string): Promise<string> {
        let replacedText = text;
        const dataViewRegex = /```dataview\s(.+?)```/gsm;
        const dvApi = getAPI();
        if (!dvApi) return replacedText;
        const matches = text.matchAll(dataViewRegex);

        const dataviewJsPrefix = dvApi.settings.dataviewJsKeyword;
        const dataViewJsRegex = new RegExp("```" + escapeRegExp(dataviewJsPrefix) + "\\s(.+?)```", "gsm");
        const dataviewJsMatches = text.matchAll(dataViewJsRegex);

        const inlineQueryPrefix = dvApi.settings.inlineQueryPrefix;
        const inlineDataViewRegex = new RegExp("`" + escapeRegExp(inlineQueryPrefix) + "(.+?)`", "gsm");
        const inlineMatches = text.matchAll(inlineDataViewRegex);

        const inlineJsQueryPrefix = dvApi.settings.inlineJsQueryPrefix;
        const inlineJsDataViewRegex = new RegExp("`" + escapeRegExp(inlineJsQueryPrefix) + "(.+?)`", "gsm");
        const inlineJsMatches = text.matchAll(inlineJsDataViewRegex);

        if (!matches && !inlineMatches && !dataviewJsMatches && !inlineJsMatches) return;

        //Code block queries
        for (const queryBlock of matches) {
            try {
                const block = queryBlock[0];
                const query = queryBlock[1];
                const markdown = await dvApi.tryQueryMarkdown(query, path);
                replacedText = replacedText.replace(block, `${markdown}\n{ .block-language-dataview}`);
            } catch (e) {
                console.log(e)
                new Notice("Unable to render dataview query. Please update the dataview plugin to the latest version.")
                return queryBlock[0];
            }
        }

        for (const queryBlock of dataviewJsMatches) {
            try {
                const block = queryBlock[0];
                const query = queryBlock[1];

                const div = createEl('div');
                const component = new Component();
                await dvApi.executeJs(query, div, component, path)
                component.load();

                replacedText = replacedText.replace(block, div.innerHTML);
            } catch (e) {
                console.log(e)
                new Notice("Unable to render dataviewjs query. Please update the dataview plugin to the latest version.")
                return queryBlock[0];
            }
        }

        //Inline queries
        for (const inlineQuery of inlineMatches) {
            try {
                const code = inlineQuery[0];
                const query = inlineQuery[1];
                const dataviewResult = dvApi.tryEvaluate(query, { this: dvApi.page(path) });
                if (dataviewResult) {
                    replacedText = replacedText.replace(code, dataviewResult.toString());
                }
            } catch (e) {
                console.log(e)
                new Notice("Unable to render inline dataview query. Please update the dataview plugin to the latest version.")
                return inlineQuery[0];
            }
        }

        for (const inlineJsQuery of inlineJsMatches) {
            try {
                const code = inlineJsQuery[0];
                const query = inlineJsQuery[1];

                const div = createEl('div');
                const component = new Component();
                await dvApi.executeJs(query, div, component, path)
                component.load();

                replacedText = replacedText.replace(code, div.innerHTML)

            } catch (e) {
                console.log(e)
                new Notice("Unable to render inline dataviewjs query. Please update the dataview plugin to the latest version.")
                return inlineJsQuery[0];
            }
        }


        return replacedText;

    }

    getProcessedFrontMatter(file: TFile): string {
        const fileFrontMatter = { ...this.metadataCache.getCache(file.path).frontmatter };
        delete fileFrontMatter["position"];

        let publishedFrontMatter: any = { "dg-publish": true };

        publishedFrontMatter = this.addPermalink(fileFrontMatter, publishedFrontMatter, file.path);
        publishedFrontMatter = this.addDefaultPassThrough(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addContentClasses(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addPageTags(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addFrontMatterSettings(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addNoteIconFrontMatter(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addTimestampsFrontmatter(fileFrontMatter, publishedFrontMatter, file);

        const fullFrontMatter = publishedFrontMatter?.dgPassFrontmatter ? { ...fileFrontMatter, ...publishedFrontMatter } : publishedFrontMatter;
        const frontMatterString = JSON.stringify(fullFrontMatter);

        return `---\n${frontMatterString}\n---\n`;
    }

    addDefaultPassThrough(baseFrontMatter: any, newFrontMatter: any) {
        // Eventually we will add other pass-throughs here. e.g. tags.
        const publishedFrontMatter = { ...newFrontMatter };
        if (baseFrontMatter) {
            if (baseFrontMatter["title"]) {
                publishedFrontMatter["title"] = baseFrontMatter["title"];
            }
            if (baseFrontMatter["dg-metatags"]) {
                publishedFrontMatter["metatags"] = baseFrontMatter["dg-metatags"];
            }
            if (baseFrontMatter["dg-hide"]) {
                publishedFrontMatter["hide"] = baseFrontMatter["dg-hide"];
            }
            if (baseFrontMatter["dg-hide-in-graph"]) {
                publishedFrontMatter["hideInGraph"] = baseFrontMatter["dg-hide-in-graph"];
            }
            if (baseFrontMatter["dg-pinned"]) {
                publishedFrontMatter["pinned"] = baseFrontMatter["dg-pinned"];
            }

        }
        return publishedFrontMatter;
    }

    addPermalink(baseFrontMatter: any, newFrontMatter: any, filePath: string) {
        const publishedFrontMatter = { ...newFrontMatter };
        const gardenPath = (baseFrontMatter && baseFrontMatter['dg-path']) ? baseFrontMatter['dg-path'] : getGardenPathForNote(filePath, this.rewriteRules);
        if (gardenPath != filePath) {
            publishedFrontMatter['dg-path'] = gardenPath;
        }

        if (baseFrontMatter && baseFrontMatter["dg-permalink"]) {
            publishedFrontMatter["dg-permalink"] = baseFrontMatter["dg-permalink"];
            publishedFrontMatter["permalink"] = baseFrontMatter["dg-permalink"];
            if (!publishedFrontMatter["permalink"].endsWith("/")) {
                publishedFrontMatter["permalink"] += "/";
            }
            if (!publishedFrontMatter["permalink"].startsWith("/")) {
                publishedFrontMatter["permalink"] = "/" + publishedFrontMatter["permalink"];
            }
        } else {
            publishedFrontMatter["permalink"] = "/" + generateUrlPath(gardenPath, this.settings.slugifyEnabled);
        }

        return publishedFrontMatter;
    }

    addPageTags(baseFrontMatter: any, newFrontMatter: any) {
        const publishedFrontMatter = { ...newFrontMatter };
        if (baseFrontMatter) {
            const tags = (typeof (baseFrontMatter["tags"]) === "string" ? [baseFrontMatter["tags"]] : baseFrontMatter["tags"]) || [];
            if (baseFrontMatter["dg-home"]) {
                tags.push("gardenEntry")
            }
            if (tags.length > 0) {
                publishedFrontMatter["tags"] = tags;
            }
        }
        return publishedFrontMatter;
    }

    addContentClasses(baseFrontMatter: any, newFrontMatter: any) {
        const publishedFrontMatter = { ...newFrontMatter };

        if (baseFrontMatter) {
            const contentClassesKey = this.settings.contentClassesKey;
            if (contentClassesKey && baseFrontMatter[contentClassesKey]) {
                if (typeof baseFrontMatter[contentClassesKey] == "string") {
                    publishedFrontMatter['contentClasses'] = baseFrontMatter[contentClassesKey];
                } else if (Array.isArray(baseFrontMatter[contentClassesKey])) {
                    publishedFrontMatter['contentClasses'] = baseFrontMatter[contentClassesKey].join(" ");
                } else {
                    publishedFrontMatter['contentClasses'] = "";
                }
            }
        }

        return publishedFrontMatter;
    }

    addTimestampsFrontmatter(baseFrontMatter: any, newFrontMatter: any, file: TFile) {
        if (!baseFrontMatter) {
            baseFrontMatter = {};
        }

        //If all note icon settings are disabled, don't change the frontmatter, so that people won't see all their notes as changed in the publication center
        if (!this.settings.showCreatedTimestamp
            && !this.settings.showUpdatedTimestamp) {
            return newFrontMatter;
        }

        const publishedFrontMatter = { ...newFrontMatter };
        const createdKey = this.settings.createdTimestampKey;
        const updatedKey = this.settings.updatedTimestampKey;
        if (createdKey.length) {
            if (typeof baseFrontMatter[createdKey] == "string") {
                publishedFrontMatter['created'] = baseFrontMatter[createdKey];
            } else {
                publishedFrontMatter['created'] = '';
            }
        } else {
            publishedFrontMatter['created'] = DateTime.fromMillis(file.stat.ctime).toISO();
        }
        if (updatedKey.length) {
            if (typeof baseFrontMatter[updatedKey] == "string") {
                publishedFrontMatter['updated'] = baseFrontMatter[updatedKey];
            } else {
                publishedFrontMatter['updated'] = '';
            }
        } else {
            publishedFrontMatter['updated'] = DateTime.fromMillis(file.stat.mtime).toISO();
        }
        return publishedFrontMatter;
    }

    addNoteIconFrontMatter(baseFrontMatter: any, newFrontMatter: any) {
        if (!baseFrontMatter) {
            baseFrontMatter = {};
        }

        //If all note icon settings are disabled, don't change the frontmatter, so that people won't see all their notes as changed in the publication center
        if (!this.settings.showNoteIconInFileTree
            && !this.settings.showNoteIconOnInternalLink
            && !this.settings.showNoteIconOnTitle
            && !this.settings.showNoteIconOnBackLink) {
            return newFrontMatter;
        }

        const publishedFrontMatter = { ...newFrontMatter };
        const noteIconKey = this.settings.noteIconKey;
        if (baseFrontMatter[noteIconKey] !== undefined) {
            publishedFrontMatter['noteIcon'] = baseFrontMatter[noteIconKey];
        } else {
            publishedFrontMatter['noteIcon'] = this.settings.defaultNoteIcon;
        }
        return publishedFrontMatter;
    }

    addFrontMatterSettings(baseFrontMatter: {}, newFrontMatter: {}) {
        if (!baseFrontMatter) {
            baseFrontMatter = {};
        }
        const publishedFrontMatter = { ...newFrontMatter };
        for (const key of Object.keys(this.settings.defaultNoteSettings)) {
            //@ts-ignore
            if (baseFrontMatter[kebabize(key)] !== undefined) {
                //@ts-ignore
                publishedFrontMatter[key] = baseFrontMatter[kebabize(key)]
            }
        }

        if (this.settings.defaultNoteSettings.dgPassFrontmatter) {
            //@ts-ignore
            publishedFrontMatter.dgPassFrontmatter = this.settings.defaultNoteSettings.dgPassFrontmatter;
        }

        return publishedFrontMatter;
    }

    async convertLinksToFullPath(text: string, filePath: string): Promise<string> {
        let convertedText = text;

        const textToBeProcessed = this.stripAwayCodeFencesAndFrontmatter(text);

        const linkedFileRegex = /\[\[(.+?)\]\]/g;
        const linkedFileMatches = textToBeProcessed.match(linkedFileRegex);

        if (linkedFileMatches) {
            for (const linkMatch of linkedFileMatches) {
                try {

                    const textInsideBrackets = linkMatch.substring(linkMatch.indexOf('[') + 2, linkMatch.lastIndexOf(']') - 1);
                    let [linkedFileName, prettyName] = textInsideBrackets.split("|");
                    if (linkedFileName.endsWith("\\")) {
                        linkedFileName = linkedFileName.substring(0, linkedFileName.length - 1);
                    }

                    prettyName = prettyName || linkedFileName;
                    let headerPath = "";
                    if (linkedFileName.includes("#")) {
                        const headerSplit = linkedFileName.split("#");
                        linkedFileName = headerSplit[0];
                        //currently no support for linking to nested heading with multiple #s
                        headerPath = headerSplit.length > 1 ? `#${headerSplit[1]}` : '';

                    }
                    const fullLinkedFilePath = getLinkpath(linkedFileName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(fullLinkedFilePath, filePath);
                    if (!linkedFile) {
                        convertedText = convertedText.replace(linkMatch, `[[${linkedFileName}${headerPath}\\|${prettyName}]]`);
                    }
                    if (linkedFile?.extension === "md") {
                        const extensionlessPath = linkedFile.path.substring(0, linkedFile.path.lastIndexOf('.'));
                        convertedText = convertedText.replace(linkMatch, `[[${extensionlessPath}${headerPath}\\|${prettyName}]]`);
                    }
                } catch (e) {
                    console.log(e);
                    continue;
                }
            }
        }

        return convertedText;

    }

    async createTranscludedText(text: string, filePath: string, currentDepth: number): Promise<string> {
        if (currentDepth >= 4) {
            return text;
        }
        const { notes: publishedFiles } = await this.getFilesMarkedForPublishing();
        let transcludedText = text;
        const transcludedRegex = /!\[\[(.+?)\]\]/g;
        const transclusionMatches = text.match(transcludedRegex);
        let numberOfExcaliDraws = 0;
        if (transclusionMatches) {
            for (let i = 0; i < transclusionMatches.length; i++) {
                try {
                    const transclusionMatch = transclusionMatches[i];
                    const [tranclusionFileName, headerName] = transclusionMatch.substring(transclusionMatch.indexOf('[') + 2, transclusionMatch.indexOf(']')).split("|");
                    const tranclusionFilePath = getLinkpath(tranclusionFileName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(tranclusionFilePath, filePath);
                    let sectionID = "";
                    if (linkedFile.name.endsWith(".excalidraw.md")) {
                        const firstDrawing = ++numberOfExcaliDraws === 1;
                        const excaliDrawCode = await this.generateExcalidrawMarkdown(linkedFile, firstDrawing, `${numberOfExcaliDraws}`, false);

                        transcludedText = transcludedText.replace(transclusionMatch, excaliDrawCode);

                    } else if (linkedFile.extension === "md") {

                        let fileText = await this.vault.cachedRead(linkedFile);
                        if (tranclusionFileName.includes('#^')) {
                            // Transclude Block
                            const metadata = this.metadataCache.getFileCache(linkedFile);
                            const refBlock = tranclusionFileName.split('#^')[1];
                            sectionID = `#${slugify(refBlock)}`;
                            const blockInFile = metadata.blocks[refBlock];
                            if (blockInFile) {

                                fileText = fileText
                                    .split('\n')
                                    .slice(blockInFile.position.start.line, blockInFile.position.end.line + 1)
                                    .join('\n').replace(`^${refBlock}`, '');
                            }
                        } else if (tranclusionFileName.includes('#')) { // transcluding header only
                            const metadata = this.metadataCache.getFileCache(linkedFile);
                            const refHeader = tranclusionFileName.split('#')[1];
                            const headerInFile = metadata.headings?.find(header => header.heading === refHeader);
                            sectionID = `#${slugify(refHeader)}`;
                            if (headerInFile) {
                                const headerPosition = metadata.headings.indexOf(headerInFile);
                                // Embed should copy the content proparly under the given block
                                const cutTo = metadata.headings.slice(headerPosition + 1).find(header => header.level <= headerInFile.level);
                                if (cutTo) {
                                    const cutToLine = cutTo?.position?.start?.line;
                                    fileText = fileText
                                        .split('\n')
                                        .slice(headerInFile.position.start.line, cutToLine)
                                        .join('\n');
                                } else {
                                    fileText = fileText
                                        .split('\n')
                                        .slice(headerInFile.position.start.line)
                                        .join('\n');
                                }

                            }
                        }
                        //Remove frontmatter from transclusion
                        fileText = fileText.replace(this.frontmatterRegex, "");

                        // Apply custom filters to transclusion
                        fileText = await this.convertCustomFilters(fileText);

                        const header = this.generateTransclusionHeader(headerName, linkedFile);

                        const headerSection = header ? `$<div class="markdown-embed-title">\n\n${header}\n\n</div>\n` : '';
                        let embedded_link = "";
                        if (publishedFiles.find((f) => f.path == linkedFile.path)) {
                            embedded_link = `<a class="markdown-embed-link" href="/${generateUrlPath(getGardenPathForNote(linkedFile.path, this.rewriteRules))}${sectionID}" aria-label="Open link"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-link"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></a>`;
                        }
                        fileText = `\n<div class="transclusion internal-embed is-loaded">${embedded_link}<div class="markdown-embed">\n\n${headerSection}\n\n`
                            + fileText + '\n\n</div></div>\n'

                        if (fileText.match(transcludedRegex)) {
                            fileText = await this.createTranscludedText(fileText, linkedFile.path, currentDepth + 1);
                        }
                        //This should be recursive up to a certain depth
                        transcludedText = transcludedText.replace(transclusionMatch, fileText);
                    }
                } catch {
                    continue;
                }
            }
        }

        return transcludedText;

    } 

    async createSvgEmbeds(text: string, filePath: string): Promise<string> {

        function setWidth(svgText: string, size: string): string {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
            const svgElement = svgDoc.getElementsByTagName("svg")[0];
            svgElement.setAttribute("width", size);
            fixSvgForXmlSerializer(svgElement);
            const svgSerializer = new XMLSerializer();
            return svgSerializer.serializeToString(svgDoc);
        }
        //![[image.svg]]
        const transcludedSvgRegex = /!\[\[(.*?)(\.(svg))\|(.*?)\]\]|!\[\[(.*?)(\.(svg))\]\]/g;
        const transcludedSvgs = text.match(transcludedSvgRegex);
        if (transcludedSvgs) {
            for (const svg of transcludedSvgs) {
                try {

                    const [imageName, size] = svg.substring(svg.indexOf('[') + 2, svg.indexOf(']')).split("|");
                    const imagePath = getLinkpath(imageName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    let svgText = await this.vault.read(linkedFile);
                    if (svgText && size) {
                        svgText = setWidth(svgText, size);
                    }
                    text = text.replace(svg, svgText);
                } catch {
                    continue;
                }
            }
        }

        //!()[image.svg]
        const linkedSvgRegex = /!\[(.*?)\]\((.*?)(\.(svg))\)/g;
        const linkedSvgMatches = text.match(linkedSvgRegex);
        if (linkedSvgMatches) {
            for (const svg of linkedSvgMatches) {
                try {
                    const [imageName, size] = svg.substring(svg.indexOf('[') + 2, svg.indexOf(']')).split("|");
                    const pathStart = svg.lastIndexOf("(") + 1;
                    const pathEnd = svg.lastIndexOf(")");
                    const imagePath = svg.substring(pathStart, pathEnd);
                    if (imagePath.startsWith("http")) {
                        continue;
                    }

                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    let svgText = await this.vault.read(linkedFile);
                    if (svgText && size) {
                        svgText = setWidth(svgText, size);
                    }
                    text = text.replace(svg, svgText);
                } catch {
                    continue;
                }
            }
        }

        return text;
    }

    async extractImageLinks(text: string, filePath: string): Promise<string[]> {
        const assets = [];

        const imageText = text;
        //![[image.png]]
        const transcludedImageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
        const transcludedImageMatches = text.match(transcludedImageRegex);
        if (transcludedImageMatches) {
            for (let i = 0; i < transcludedImageMatches.length; i++) {
                try {
                    const imageMatch = transcludedImageMatches[i];

                    const [imageName, _] = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']')).split("|");
                    const imagePath = getLinkpath(imageName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    assets.push(linkedFile.path)
                } catch (e) {
                    continue;
                }
            }
        }

        //![](image.png)
        const imageRegex = /!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif))\)/g;
        const imageMatches = text.match(imageRegex);
        if (imageMatches) {
            for (let i = 0; i < imageMatches.length; i++) {
                try {
                    const imageMatch = imageMatches[i];

                    const nameStart = imageMatch.indexOf('[') + 1;
                    const nameEnd = imageMatch.indexOf(']');

                    const pathStart = imageMatch.lastIndexOf("(") + 1;
                    const pathEnd = imageMatch.lastIndexOf(")");
                    const imagePath = imageMatch.substring(pathStart, pathEnd);
                    if (imagePath.startsWith("http")) {
                        continue;
                    }

                    const decodedImagePath = decodeURI(imagePath);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(decodedImagePath, filePath);
                    assets.push(linkedFile.path)
                } catch {
                    continue;
                }
            }
        }
        return assets;
    }

    async convertImageLinks(text: string, filePath: string): Promise<[string, Array<{ path: string, content: string }>]> {
        const assets = [];

        let imageText = text;
        //![[image.png]]
        const transcludedImageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
        const transcludedImageMatches = text.match(transcludedImageRegex);
        if (transcludedImageMatches) {
            for (let i = 0; i < transcludedImageMatches.length; i++) {
                try {
                    const imageMatch = transcludedImageMatches[i];

                    const [imageName, size] = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']')).split("|");
                    const imagePath = getLinkpath(imageName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    const image = await this.vault.readBinary(linkedFile);
                    const imageBase64 = arrayBufferToBase64(image)

                    const cmsImgPath = `/img/user/${linkedFile.path}`
                    const name = size ? `${imageName}|${size}` : imageName;
                    const imageMarkdown = `![${name}](${encodeURI(cmsImgPath)})`;
                    assets.push({ path: cmsImgPath, content: imageBase64 })
                    imageText = imageText.replace(imageMatch, imageMarkdown);
                } catch (e) {
                    continue;
                }
            }
        }

        //![](image.png)
        const imageRegex = /!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif))\)/g;
        const imageMatches = text.match(imageRegex);
        if (imageMatches) {
            for (let i = 0; i < imageMatches.length; i++) {
                try {
                    const imageMatch = imageMatches[i];

                    const nameStart = imageMatch.indexOf('[') + 1;
                    const nameEnd = imageMatch.indexOf(']');
                    const imageName = imageMatch.substring(nameStart, nameEnd);

                    const pathStart = imageMatch.lastIndexOf("(") + 1;
                    const pathEnd = imageMatch.lastIndexOf(")");
                    const imagePath = imageMatch.substring(pathStart, pathEnd);
                    if (imagePath.startsWith("http")) {
                        continue;
                    }

                    const decodedImagePath = decodeURI(imagePath);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(decodedImagePath, filePath);
                    const image = await this.vault.readBinary(linkedFile);
                    const imageBase64 = arrayBufferToBase64(image);
                    const cmsImgPath = `/img/user/${linkedFile.path}`
                    const imageMarkdown = `![${imageName}](${cmsImgPath})`;
                    assets.push({ path: cmsImgPath, content: imageBase64 })
                    imageText = imageText.replace(imageMatch, imageMarkdown);
                } catch {
                    continue;
                }
            }
        }

        return [imageText, assets];
    }

    generateTransclusionHeader(headerName: string, transcludedFile: TFile) {
        if (!headerName) {
            return headerName;
        }

        const titleVariable = "{{title}}";
        if (headerName && headerName.indexOf(titleVariable) > -1) {
            headerName = headerName.replace(titleVariable, transcludedFile.basename);
        }

        //Defaults to h1
        if (headerName && !headerName.startsWith("#")) {
            headerName = "# " + headerName;
        } else if (headerName) {
            //Add a space to the start of the header if not already there
            const headerParts = headerName.split("#");
            if (!headerParts.last().startsWith(" ")) {
                headerName = headerName.replace(headerParts.last(), " " + headerParts.last());
            }

        }
        return headerName;
    }

    async generateExcalidrawMarkdown(file: TFile, includeExcaliDrawJs: boolean, idAppendage = "", includeFrontMatter = true): Promise<string> {
        if (!file.name.endsWith(".excalidraw.md")) return "";

        const fileText = await this.vault.cachedRead(file);
        const frontMatter = await this.getProcessedFrontMatter(file);

        const isCompressed = fileText.includes("```compressed-json")
        const start = fileText.indexOf(isCompressed ? "```compressed-json" : "```json") + (isCompressed ? "```compressed-json" : "```json").length;
        const end = fileText.lastIndexOf('```')
        const excaliDrawJson = JSON.parse(
            isCompressed ? LZString.decompressFromBase64(fileText.slice(start, end).replace(/[\n\r]/g, "")) : fileText.slice(start, end)
        );

        const drawingId = file.name.split(" ").join("_").replace(".", "") + idAppendage;
        let excaliDrawCode = "";
        if (includeExcaliDrawJs) {
            excaliDrawCode += excaliDrawBundle;
        }

        excaliDrawCode += excalidraw(JSON.stringify(excaliDrawJson), drawingId);

        return `${includeFrontMatter ? frontMatter : ''}${excaliDrawCode}`;
    }
}