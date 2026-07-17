// Guards against Svelte components silently missing from the bundle.
// svelte-preprocess/TS can strip component imports that are only used in
// markup (see the 2.80.0 "Tutorial is not defined" bug); esbuild then emits
// calls to undefined identifiers without failing the build. Every bundled
// module gets a `// <path>` comment in the (unminified) output, so we assert
// one exists for each .svelte file that is imported somewhere in the source.
import fs from "fs";
import path from "path";

const bundlePath = process.argv[2] ?? "main.js";
const bundle = fs.readFileSync(bundlePath, "utf8");

const sourceFiles = [];

const walk = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if (entry.name === "dg-testVault") continue;
			walk(full);
		} else if (/\.(ts|svelte)$/.test(entry.name)) {
			sourceFiles.push(full);
		}
	}
};
walk("src");
sourceFiles.push("main.ts");

const importedSveltePaths = new Set();

for (const file of sourceFiles) {
	// Imports from files that were themselves tree-shaken away (dead code)
	// don't need to be in the bundle.
	const importerBundled =
		file === "main.ts" || bundle.includes(`// ${path.normalize(file)}`);

	if (!importerBundled) continue;

	const content = fs.readFileSync(file, "utf8");

	for (const match of content.matchAll(/from\s+["']([^"']+\.svelte)["']/g)) {
		const spec = match[1];

		const resolved = spec.startsWith(".")
			? path.join(path.dirname(file), spec)
			: spec; // tsconfig-style "src/..." absolute import
		importedSveltePaths.add(path.normalize(resolved));
	}
}

const missing = [...importedSveltePaths].filter(
	(sveltePath) => !bundle.includes(`// ${sveltePath}`),
);

if (missing.length > 0) {
	console.error(
		`Bundle verification FAILED — imported Svelte components missing from ${bundlePath}:`,
	);
	missing.forEach((m) => console.error(`  - ${m}`));
	process.exit(1);
}

console.log(
	`Bundle verification OK — ${importedSveltePaths.size} Svelte components present in ${bundlePath}`,
);
