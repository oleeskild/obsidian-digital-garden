// Polyfill Obsidian's String.prototype extensions used in production code
if (!String.prototype.contains) {
	// eslint-disable-next-line no-extend-native
	Object.defineProperty(String.prototype, "contains", {
		value(str: string): boolean {
			return (this as string).indexOf(str) !== -1;
		},
		writable: true,
		configurable: true,
	});
}
