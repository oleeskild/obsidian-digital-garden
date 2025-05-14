import Publisher from "../../publisher/Publisher";
import { Notice, Platform } from "obsidian";
import QuartzSyncerSettings from "../../models/settings";
import fs from "fs/promises";

const SNAPSHOT_PATH = "src/test/snapshot/snapshot.md";

export const generateSyncerSnapshot = async (
	settings: QuartzSyncerSettings,
	publisher: Publisher,
) => {
	const devPluginPath = settings.devPluginPath;

	if (!devPluginPath) {
		new Notice("devPluginPath missing, run generateSyncerSettings.mjs");

		return;
	}

	const marked = await publisher.getFilesMarkedForPublishing();
	let fileString = "IMAGES: \n";
	fileString += marked.blobs.map((path) => `${path}\n`);

	const assetPaths = new Set<string>();

	for (const file of marked.notes) {
		fileString += "==========\n";
		fileString += `${file.getPath()}\n`;
		fileString += "==========\n";

		const [content, assets] =
			await publisher.compiler.generateMarkdown(file);
		assets.blobs.map((blob) => assetPaths.add(blob.path));

		fileString += `${content}\n`;
		fileString += Array.from(assetPaths).map((path) => `${path}\n`);
	}
	fileString += "==========\n";

	const fullSnapshotPath = `${devPluginPath}/${SNAPSHOT_PATH}`;

	if (Platform.isDesktop) {
		await fs.writeFile(fullSnapshotPath, fileString);
	}
	new Notice(`Snapshot written to ${fullSnapshotPath}`);
	new Notice(`Check snapshot to make sure nothing has accidentally changed`);
};
