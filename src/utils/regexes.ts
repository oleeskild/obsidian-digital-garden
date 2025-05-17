export const FRONTMATTER_REGEX = /^\s*?---\n([\s\S]*?)\n---/g;

export const BLOCKREF_REGEX = /(\^\w+(\n|$))/g;

export const CODE_FENCE_REGEX = /`(.*?)`/g;

export const CODEBLOCK_REGEX = /```.*?\n[\s\S]+?```/g;

export const EXCALIDRAW_REGEX = /:\[\[(\d*?,\d*?)\],.*?\]\]/g;

export const TRANSCLUDED_SVG_REGEX =
	/!\[\[(.*?)(\.(svg))\|(.*?)\]\]|!\[\[(.*?)(\.(svg))\]\]/g;

export const DATAVIEW_LINK_TARGET_BLANK_REGEX =
	/target=["']_blank["'] rel=["']noopener["']/g;

export const TRANSCLUDED_FILE_REGEX =
	/!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp|mp4|mkv|mov|avi|mp3|wav|ogg|pdf))\|(.*?)\]\]|!\[\[(.*?)(\.(png|jpg|jpeg|gif|webp|mp4|mkv|mov|avi|mp3|wav|ogg|pdf))\]\]/g;

export const FILE_REGEX =
	/!\[(.*?)\]\((.*?)(\.(png|jpg|jpeg|gif|webp|mp4|mkv|mov|avi|mp3|wav|ogg|pdf))\)/g;
