import dotevnt from "dotenv";
import fs from "fs";
dotevnt.config();
import copyfiles from "copyfiles";
import Logger from "js-logger";

const quartzSettings = {
	githubRepo:
		process.env.GITHUB_REPO || "add your repo to .env as GITHUB_REPO",
	githubToken:
		process.env.GITHUB_TOKEN || "add your token to .env as GITHUB_TOKEN",
	githubUserName:
		process.env.GITHUB_USERNAME ||
		"add your username to .env as GITHUB_USERNAME",

	useFullResolutionImages: false,
	noteSettingsIsInitialized: true,

	contentFolder: "content",
	vaultPath: "/",
	useDataview: true,
	useExcalidraw: false,

	useThemes: false,

	includeAllFrontmatter: false,

	applyEmbeds: true,

	showCreatedTimestamp: true,
	createdTimestampKey: "created",
	showUpdatedTimestamp: true,
	updatedTimestampKey: "modified",
	showPublishedTimestamp: false,
	publishedTimestampKey: "published",
	timestampFormat: "MMM dd, yyyy h:mm a",

	pathRewriteRules: `
Path Rewriting/Subfolder2:fun-folder
Path Rewriting:
Subfolder:subfolder-rewritten
Path Rewriting/Subfolder:this-will-never-hit`,
	publishFrontmatterKey: "publish",
	usePermalink: true,
	ENABLE_DEVELOPER_TOOLS: true,
	devPluginPath: `${process.cwd()}`,
	logLevel: Logger.DEBUG,
};

const TEST_VAULT_PATH =
	"content/.obsidian/plugins/quartz-syncer/";

console.log("Creating test vault data.json");
// write garden settings to test vault
fs.writeFile(
	`${TEST_VAULT_PATH}/data.json`,
	JSON.stringify(quartzSettings, null, 2),
	function (err) {
		if (err) {
			console.log(err);
		}
	},
);

const FILES_TO_COPY = ["main.js", "manifest.json", "styles.css"];
console.log("Copying generated files to test vault");
// copy generated files to test vault
copyfiles([...FILES_TO_COPY, TEST_VAULT_PATH], {}, () => {});
