import { PublishStatus } from "../../publisher/PublishStatusManager";
import { CompiledPublishFile } from "../../publishFile/PublishFile";

export type FileStatus = "changed" | "new" | "deleted" | "published";

export interface AnnotatedFile {
	path: string;
	status: FileStatus;
	isImage: boolean;
	file?: CompiledPublishFile;
}

export function annotateFiles(status: PublishStatus): AnnotatedFile[] {
	const files: AnnotatedFile[] = [];

	for (const f of status.changedNotes) {
		files.push({ path: f.getPath(), status: "changed", isImage: false, file: f });
	}

	for (const f of status.unpublishedNotes) {
		files.push({ path: f.getPath(), status: "new", isImage: false, file: f });
	}

	for (const f of status.publishedNotes) {
		files.push({ path: f.getPath(), status: "published", isImage: false, file: f });
	}

	for (const p of status.deletedNotePaths) {
		files.push({ path: p.path, status: "deleted", isImage: false });
	}

	for (const p of status.deletedImagePaths) {
		files.push({ path: p.path, status: "deleted", isImage: true });
	}

	return files;
}

export function defaultSelection(files: AnnotatedFile[]): Set<string> {
	return new Set(
		files.filter((f) => f.status !== "published").map((f) => f.path),
	);
}

export interface PublishPlan {
	notesToPublish: CompiledPublishFile[];
	notesToDelete: string[];
	imagesToDelete: string[];
}

export function buildPublishPlan(
	selected: Set<string>,
	files: AnnotatedFile[],
): PublishPlan {
	const plan: PublishPlan = {
		notesToPublish: [],
		notesToDelete: [],
		imagesToDelete: [],
	};

	for (const f of files) {
		if (!selected.has(f.path)) continue;

		if (f.status === "deleted") {
			if (f.isImage) plan.imagesToDelete.push(f.path);
			else plan.notesToDelete.push(f.path);
		} else if (f.status === "new" || f.status === "changed") {
			if (f.file) plan.notesToPublish.push(f.file);
		}
		// published files are never published/deleted
	}

	return plan;
}
