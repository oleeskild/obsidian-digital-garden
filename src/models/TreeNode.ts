type TreeNode = {
	name: string;
	children?: TreeNode[];
	isRoot: boolean;
	path: string;
	checked: boolean;
	indeterminate: boolean;
};

export default TreeNode;
