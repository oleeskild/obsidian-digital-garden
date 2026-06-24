import { AnnotatedFile, FileStatus } from "./annotate";

export interface FileTreeNode {
	name: string;
	path: string;
	isFolder: boolean;
	status?: FileStatus;
	isImage?: boolean;
	children?: FileTreeNode[];
}

export function buildFileTree(files: AnnotatedFile[]): FileTreeNode {
	const root: FileTreeNode = {
		name: "",
		path: "",
		isFolder: true,
		children: [],
	};

	for (const f of files) {
		const parts = f.path.split("/");
		let node = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;

			if (!node.children) node.children = [];

			let child = node.children.find(
				(c) => c.name === part && c.isFolder === !isLast,
			);

			if (!child) {
				child = isLast
					? {
							name: part,
							path: f.path,
							isFolder: false,
							status: f.status,
							isImage: f.isImage,
					  }
					: {
							name: part,
							path: parts.slice(0, i + 1).join("/"),
							isFolder: true,
							children: [],
					  };
				node.children.push(child);
			}

			node = child;
		}
	}

	sortTree(root);

	return root;
}

function sortTree(node: FileTreeNode): void {
	if (!node.children) return;

	node.children.sort((a, b) => {
		if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

		return a.name.localeCompare(b.name);
	});

	for (const c of node.children) sortTree(c);
}

export function collectFilePaths(node: FileTreeNode): string[] {
	if (!node.isFolder) return [node.path];

	const out: string[] = [];

	for (const c of node.children ?? []) {
		out.push(...collectFilePaths(c));
	}

	return out;
}

export function filterTree(
	node: FileTreeNode,
	active: Set<FileStatus>,
): FileTreeNode | null {
	if (!node.isFolder) {
		return node.status && active.has(node.status) ? node : null;
	}

	const kids = (node.children ?? [])
		.map((c) => filterTree(c, active))
		.filter((c): c is FileTreeNode => c !== null);

	if (kids.length === 0 && node.path !== "") return null;

	return { ...node, children: kids };
}
