import { getRegionConflicts, getRegionProviders, regionsOf } from "./regions";
import {
	GardenPluginManifest,
	InstalledGardenPlugin,
} from "src/models/gardenPlugin";

const makeInstalled = (
	id: string,
	enabled: boolean,
	regions?: Record<string, string>,
): InstalledGardenPlugin => ({
	manifest: {
		id,
		name: id,
		version: "1.0.0",
		description: "",
		author: "",
		regions,
	},
	enabled,
	isFirstParty: id.startsWith("dg-"),
});

describe("regionsOf", () => {
	it("returns declared region names", () => {
		expect(
			regionsOf({
				regions: { navigation: "t.njk" },
			} as unknown as GardenPluginManifest),
		).toEqual(["navigation"]);

		expect(regionsOf({} as GardenPluginManifest)).toEqual([]);
	});
});

describe("getRegionProviders", () => {
	it("assigns each region to the first enabled claimant by id", () => {
		const providers = getRegionProviders([
			makeInstalled("moc-nav", true, { navigation: "t.njk" }),
			makeInstalled("dg-filetree", true, { navigation: "t.njk" }),
		]);

		expect(providers).toEqual({ navigation: "dg-filetree" });
	});

	it("skips disabled claimants", () => {
		const providers = getRegionProviders([
			makeInstalled("dg-filetree", false, { navigation: "t.njk" }),
			makeInstalled("moc-nav", true, { navigation: "t.njk" }),
		]);

		expect(providers).toEqual({ navigation: "moc-nav" });
	});

	it("returns nothing when no plugin claims regions", () => {
		expect(getRegionProviders([makeInstalled("dg-search", true)])).toEqual(
			{},
		);
	});
});

describe("getRegionConflicts", () => {
	const incoming = {
		id: "moc-nav",
		name: "MOC",
		version: "1.0.0",
		description: "",
		author: "",
		regions: { navigation: "t.njk" },
	} as GardenPluginManifest;

	it("finds enabled plugins claiming the same region", () => {
		const conflicts = getRegionConflicts(incoming, [
			makeInstalled("dg-filetree", true, { navigation: "t.njk" }),
			makeInstalled("dg-search", true),
		]);

		expect(conflicts.map((c) => c.manifest.id)).toEqual(["dg-filetree"]);
	});

	it("ignores disabled plugins and the incoming plugin itself", () => {
		const conflicts = getRegionConflicts(incoming, [
			makeInstalled("dg-filetree", false, { navigation: "t.njk" }),
			makeInstalled("moc-nav", true, { navigation: "t.njk" }),
		]);

		expect(conflicts).toEqual([]);
	});

	it("returns nothing when the incoming plugin claims no region", () => {
		expect(
			getRegionConflicts({ id: "x" } as GardenPluginManifest, [
				makeInstalled("dg-filetree", true, { navigation: "t.njk" }),
			]),
		).toEqual([]);
	});
});
