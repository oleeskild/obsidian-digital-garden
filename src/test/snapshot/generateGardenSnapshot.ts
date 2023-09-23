import Publisher from "../../publisher/Publisher";
import { Notice } from "obsidian";

const SNAPSHOT_PATH = "src/test/snapshot";

export const generateGardenSnapshot = async (publisher: Publisher) => {
	const marked = await publisher.getFilesMarkedForPublishing();
	let fileString = "---\n";
	for (const file of marked.notes) {
		const [content, _] = await publisher.generateMarkdown(file);
		// TODO: add assets

		fileString += `${content}\n`;
	}
	fileString += "---\n";

	await navigator.clipboard.writeText(fileString);
	new Notice(`Snapshot copied to clipboard, save to ${SNAPSHOT_PATH}`);
};
