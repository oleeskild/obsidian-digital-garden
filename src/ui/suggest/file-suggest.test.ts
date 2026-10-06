import { TFile, TFolder } from "obsidian";
import { filterFilesByExtension } from "./file-suggest";

jest.mock("obsidian", () => {
	class TAbstractFile {
		constructor(public path: string) {}
	}

	class TFile extends TAbstractFile {
		extension: string;

		constructor(path: string) {
			super(path);
			this.extension = path.split(".").pop() ?? "";
		}
	}

	class TFolder extends TAbstractFile {}

	return { TFile, TFolder, AbstractInputSuggest: class {} };
});

const file = (path: string) =>
	new (TFile as unknown as new (path: string) => TFile)(path);

const folder = (path: string) =>
	new (TFolder as unknown as new (path: string) => TFolder)(path);

describe("filterFilesByExtension", () => {
	const files = [
		folder("assets"),
		file("assets/logo.png"),
		file("assets/Favicon.SVG"),
		file("assets/icon.svg"),
		file("notes/Logo ideas.md"),
	];

	it("only returns files with a matching extension, ignoring case", () => {
		expect(
			filterFilesByExtension(files, ["svg"], "").map((f) => f.path),
		).toEqual(["assets/Favicon.SVG", "assets/icon.svg"]);
	});

	it("matches the query case-insensitively against the full path", () => {
		expect(
			filterFilesByExtension(files, ["png", "md"], "LOGO").map(
				(f) => f.path,
			),
		).toEqual(["assets/logo.png", "notes/Logo ideas.md"]);
	});

	it("never returns folders", () => {
		expect(filterFilesByExtension(files, [""], "assets")).toEqual([]);
	});
});
