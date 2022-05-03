import { MetadataCache, TFile, Vault, Notice, getLinkpath } from "obsidian";
import DigitalGardenSettings from "src/DigitalGardenSettings";
import { Base64 } from "js-base64";
import { Octokit } from "@octokit/core";
import { arrayBufferToBase64, generateUrlPath, kebabize } from "./utils";
import { vallidatePublishFrontmatter } from "./Validator";
import { excaliDrawBundle, excalidraw } from "./constants";
import { getuid } from "process";


export interface IPublisher {
    publish(file: TFile): Promise<boolean>;
    delete(vaultFilePath: string): Promise<boolean>;
    getFilesMarkedForPublishing(): Promise<TFile[]>;
    generateMarkdown(file: TFile): Promise<string>;
}
export default class Publisher {
    vault: Vault;
    metadataCache: MetadataCache;
    settings: DigitalGardenSettings;
    frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;

    constructor(vault: Vault, metadataCache: MetadataCache, settings: DigitalGardenSettings) {
        this.vault = vault;
        this.metadataCache = metadataCache;
        this.settings = settings;
    }

    async getFilesMarkedForPublishing(): Promise<TFile[]> {
        const files = this.vault.getMarkdownFiles();
        const filesToPublish = [];
        for (const file of files) {
            try {
                const frontMatter = this.metadataCache.getCache(file.path).frontmatter
                if (frontMatter && frontMatter["dg-publish"] === true) {
                    filesToPublish.push(file);
                }
            } catch {
                //ignore
            }
        }

        return filesToPublish;
    }

    async delete(vaultFilePath: string): Promise<boolean> {
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
        const path = `src/site/notes/${vaultFilePath}`;

        const payload = {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path,
            message: `Delete note ${vaultFilePath}`,
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
            const text = await this.generateMarkdown(file);
            await this.uploadText(file.path, text);
            return true;
        } catch {
            return false;
        }
    }

    async generateMarkdown(file: TFile): Promise<string> {
        if (file.name.endsWith(".excalidraw.md")) {
            return await this.generateExcalidrawMarkdown(file, true);
        }

        let text = await this.vault.cachedRead(file);
        text = await this.convertFrontMatter(text, file.path);
        text = await this.createTranscludedText(text, file.path, 0);
        text = await this.convertLinksToFullPath(text, file.path);
        text = await this.createBase64Images(text, file.path);
        return text;
    }


    async uploadText(filePath: string, content: string) {
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


        const base64Content = Base64.encode(content);
        const path = `src/site/notes/${filePath}`

        const payload = {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path,
            message: `Add note ${filePath}`,
            content: base64Content,
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

        payload.message = `Update note ${filePath}`;

        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', payload);

    }

    async convertFrontMatter(text: string, path: string): Promise<string> {
        const publishedFrontMatter = this.getProcessedFrontMatter(path);
        const replaced = text.replace(this.frontmatterRegex, (match, p1) => {
            return publishedFrontMatter;
        });
        return replaced;
    }

    getProcessedFrontMatter(filePath: string): string {
        const fileFrontMatter = { ...this.metadataCache.getCache(filePath).frontmatter };
        delete fileFrontMatter["position"];

        let publishedFrontMatter: any = { "dg-publish": true };

        publishedFrontMatter = this.addPermalink(fileFrontMatter, publishedFrontMatter, filePath);
        publishedFrontMatter = this.addHomePageTag(fileFrontMatter, publishedFrontMatter);
        publishedFrontMatter = this.addFrontMatterSettings(fileFrontMatter, publishedFrontMatter);

        const fullFrontMatter = publishedFrontMatter?.dgPassFrontmatter ? { ...fileFrontMatter, ...publishedFrontMatter } : publishedFrontMatter;
        const frontMatterString = JSON.stringify(fullFrontMatter);

        return `---\n${frontMatterString}\n---\n`;
    }

    addPermalink(baseFrontMatter: any, newFrontMatter: any, filePath: string) {
        let publishedFrontMatter = { ...newFrontMatter };

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
            const noteUrlPath = generateUrlPath(filePath);
            publishedFrontMatter["permalink"] = "/" + noteUrlPath;
        }

        return publishedFrontMatter;
    }

    addHomePageTag(baseFrontMatter: any, newFrontMatter: any) {
        const publishedFrontMatter = { ...newFrontMatter };
        if (baseFrontMatter && baseFrontMatter["dg-home"]) {
            const tags = baseFrontMatter["tags"];
            if (tags) {
                if (typeof (tags) === "string") {
                    publishedFrontMatter["tags"] = [tags, "gardenEntry"];
                } else {
                    publishedFrontMatter["tags"] = [...tags, "gardenEntry"];
                }
            } else {
                publishedFrontMatter["tags"] = "gardenEntry";
            }
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
            else {
                //@ts-ignore
                publishedFrontMatter[key] = this.settings.defaultNoteSettings[key];
            }
        }

        return publishedFrontMatter;
    }


    async convertLinksToFullPath(text: string, filePath: string): Promise<string> {
        let convertedText = text;

        const linkedFileRegex = /\[\[(.*?)\]\]/g;
        const linkedFileMatches = text.match(linkedFileRegex);

        const codeFenceRegex = /`(.*?)`/g;
        const codeFences = text.match(codeFenceRegex);

        const codeBlockRegex = /```.*?\n[\s\S]+?```/g;
        const codeBlocks = text.match(codeBlockRegex);

        const excaliDrawRegex = /:\[\[(\d*?,\d*?)\],.*?\]\]/g; 
        const excalidrawings = text.match(excaliDrawRegex);

        if (linkedFileMatches) {
            for (const linkMatch of linkedFileMatches) {
                try {
                    const insideCodeBlockIndex = codeBlocks ? codeBlocks.findIndex(codeBlock => codeBlock.includes(linkMatch)) : -1;
                    if(insideCodeBlockIndex>-1) {
                        codeBlocks.splice(insideCodeBlockIndex, 1);
                        continue;
                    }

                    const insideCodeFenceIndex = codeFences ? codeFences.findIndex(codeFence => codeFence.includes(linkMatch)) : -1;
                    if(insideCodeFenceIndex>-1) {
                        codeFences.splice(insideCodeFenceIndex, 1);
                        continue;
                    }

                    const excalidrawIndex = excalidrawings ? excalidrawings.findIndex(excalidraw => excalidraw.includes(linkMatch)) : -1;
                    if(excalidrawIndex>-1) {
                        excalidrawings.splice(excalidrawIndex, 1);
                        continue;
                    }


                    const textInsideBrackets = linkMatch.substring(linkMatch.indexOf('[') + 2,linkMatch.lastIndexOf(']')-1);
                    let [linkedFileName, prettyName] = textInsideBrackets.split("|");

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
                    if(!linkedFile){
                        convertedText = convertedText.replace(linkMatch, `[[${linkedFileName}${headerPath}|${prettyName}]]`);
                    }
                    if (linkedFile?.extension === "md") {
                        const extensionlessPath = linkedFile.path.substring(0, linkedFile.path.lastIndexOf('.'));
                        convertedText = convertedText.replace(linkMatch, `[[${extensionlessPath}${headerPath}|${prettyName}]]`);
                    }
                } catch(e){
                    console.log(e);
                    continue;
                }
            }
        }

        return convertedText;

    }

    async createTranscludedText(text: string, filePath: string, currentDepth:number): Promise<string> {
        if(currentDepth >= 4){
            return text;
        }

        let transcludedText = text;
        const transcludedRegex = /!\[\[(.*?)\]\]/g;
        const transclusionMatches = text.match(transcludedRegex);
        let numberOfExcaliDraws = 0;
        if (transclusionMatches) {
            for (let i = 0; i < transclusionMatches.length; i++) {
                try {
                    const transclusionMatch = transclusionMatches[i];
                    let [tranclusionFileName, headerName] = transclusionMatch.substring(transclusionMatch.indexOf('[') + 2, transclusionMatch.indexOf(']')).split("|");
                    const tranclusionFilePath = getLinkpath(tranclusionFileName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(tranclusionFilePath, filePath);

                    if (linkedFile.name.endsWith(".excalidraw.md")) {
                        let firstDrawing = ++numberOfExcaliDraws === 1;
                        const excaliDrawCode = await this.generateExcalidrawMarkdown(linkedFile, firstDrawing, `${numberOfExcaliDraws}`, false);

                        transcludedText = transcludedText.replace(transclusionMatch, excaliDrawCode);

                    } else if (linkedFile.extension === "md") {

                        let fileText = await this.vault.cachedRead(linkedFile);

                        //Remove frontmatter from transclusion
                        fileText = fileText.replace(this.frontmatterRegex, "");

                        const header = this.generateTransclusionHeader(headerName, linkedFile);

                        const headerSection = header ? `${header}\n` : '';

                        fileText = `\n<div class="transclusion internal-embed is-loaded"><div class="markdown-embed">\n\n<div class="markdown-embed-title">\n\n${headerSection}\n\n</div>\n\n`
                            + fileText + '\n\n</div></div>\n'

                        if(fileText.match(transcludedRegex)) {
                            fileText = await this.createTranscludedText(fileText,linkedFile.path, currentDepth+1);
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

    async createBase64Images(text: string, filePath: string): Promise<string> {
        let imageText = text;
        //![[image.png]]
        const transcludedImageRegex = /!\[\[(.*?)(\.(png|jpg|jpeg|gif))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif))\]\]/g;
        const transcludedImageMatches = text.match(transcludedImageRegex);
        if (transcludedImageMatches) {
            for (let i = 0; i < transcludedImageMatches.length; i++) {
                try {
                    const imageMatch = transcludedImageMatches[i];

                    let [imageName, size] = imageMatch.substring(imageMatch.indexOf('[') + 2, imageMatch.indexOf(']')).split("|");
                    const imagePath = getLinkpath(imageName);
                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    const image = await this.vault.readBinary(linkedFile);
                    const imageBase64 = arrayBufferToBase64(image)
                    const name = size ? `${imageName}|${size}` : imageName;
                    const imageMarkdown = `![${name}](data:image/${linkedFile.extension};base64,${imageBase64})`;
                    imageText = imageText.replace(imageMatch, imageMarkdown);
                } catch {
                    continue;
                }
            }
        }

        //![](image.png)
        const imageRegex = /!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif))\)/g;
        const imageMatches = text.match(imageRegex);
        if(imageMatches){
            for(let i = 0; i<imageMatches.length; i++){
                try{
                    const imageMatch = imageMatches[i];

                    let nameStart = imageMatch.indexOf('[') + 1;
                    let nameEnd = imageMatch.indexOf(']');
                    let imageName = imageMatch.substring(nameStart, nameEnd);

                    let pathStart= imageMatch.lastIndexOf("(")+1;
                    let pathEnd = imageMatch.lastIndexOf(")");
                    let imagePath = imageMatch.substring(pathStart, pathEnd);
                    if(imagePath.startsWith("http")){
                        continue;
                    }

                    const linkedFile = this.metadataCache.getFirstLinkpathDest(imagePath, filePath);
                    const image = await this.vault.readBinary(linkedFile);
                    const imageBase64 = arrayBufferToBase64(image)
                    const imageMarkdown = `![${imageName}](data:image/${linkedFile.extension};base64,${imageBase64})`;
                    imageText = imageText.replace(imageMatch, imageMarkdown);
                }catch{
                    continue;
                }
            }
        }

        return imageText;
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

    async generateExcalidrawMarkdown(file: TFile, includeExcaliDrawJs: boolean, idAppendage: string = "", includeFrontMatter = true): Promise<string> {
        if (!file.name.endsWith(".excalidraw.md")) return "";

        const fileText = await this.vault.cachedRead(file);
        const frontMatter = await this.getProcessedFrontMatter(file.path);

        const start = fileText.indexOf('```json') + "```json".length;
        const end = fileText.lastIndexOf('```')
        const excaliDrawJson = JSON.parse(fileText.slice(start, end));

        const drawingId = file.name.split(" ").join("_").replace(".", "") + idAppendage;
        let excaliDrawCode = "";
        if (includeExcaliDrawJs) {
            excaliDrawCode += excaliDrawBundle;
        }

        excaliDrawCode += excalidraw(JSON.stringify(excaliDrawJson), drawingId);

        return `${includeFrontMatter ? frontMatter:''}${excaliDrawCode}`;
    }
}



