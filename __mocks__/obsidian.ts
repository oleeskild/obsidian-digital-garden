// Polyfill Obsidian's String.prototype extensions used in production code
if (!String.prototype.contains) {
	// eslint-disable-next-line no-extend-native
	String.prototype.contains = function (str: string): boolean {
		return this.indexOf(str) !== -1;
	};
}

const obsidian = {};

module.exports = obsidian;
