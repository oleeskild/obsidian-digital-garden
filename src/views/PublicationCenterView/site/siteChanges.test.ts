import {
	computeSiteChanges,
	pullSiteValues,
	pullWholeValue,
} from "./siteChanges";
import type { SiteFieldDef } from "./siteFields";

const field = (
	id: string,
	keys = [id],
	kind: SiteFieldDef["kind"] = "text",
): SiteFieldDef => ({
	id,
	keys,
	section: "appearance",
	label: id,
	kind,
});

const fields = [field("A"), field("B"), field("C")];

describe("computeSiteChanges", () => {
	it("lists local values that differ from the site", () => {
		const changes = computeSiteChanges(
			fields,
			{ A: "2", B: "1", C: "1" },
			{ A: "1", B: "1", C: "1" },
		);

		expect(changes.map((c) => c.id)).toEqual(["A"]);
		expect(changes[0].local).toBe("2");
		expect(changes[0].remoteValues).toEqual({ A: "1" });
	});

	it("treats a missing key as empty", () => {
		expect(computeSiteChanges([field("A")], {}, { A: "" })).toHaveLength(0);
	});

	it("compares multi-key fields as one", () => {
		const style = field("style", ["CSS", "CLASSES"]);

		const changes = computeSiteChanges(
			[style],
			{ CSS: "a", CLASSES: "x" },
			{ CSS: "a", CLASSES: "y" },
		);

		expect(changes).toHaveLength(1);
		expect(changes[0].remoteValues).toEqual({ CSS: "a", CLASSES: "y" });
	});
});

describe("pullSiteValues", () => {
	it("adopts the site's values on first sync", () => {
		const pull = pullSiteValues(
			fields,
			{ A: "mine", B: "same", C: "x" },
			{ A: "theirs", B: "same", C: "y" },
			undefined,
		);

		expect(pull.adopt).toEqual({ A: "theirs", C: "y" });
		expect(pull.baseline).toEqual({ A: "theirs", B: "same", C: "y" });
	});

	it("keeps a pending local edit the site hasn't touched", () => {
		const pull = pullSiteValues(
			[field("A")],
			{ A: "edited" },
			{ A: "old" },
			{ A: "old" },
		);

		expect(pull.adopt).toEqual({});
		expect(pull.baseline).toEqual({ A: "old" });
	});

	it("lets a site change win over a local edit", () => {
		const pull = pullSiteValues(
			[field("A")],
			{ A: "edited" },
			{ A: "new on site" },
			{ A: "old" },
		);

		expect(pull.adopt).toEqual({ A: "new on site" });
	});

	it("clears text the site doesn't have", () => {
		const pull = pullSiteValues([field("A")], { A: "x" }, {}, undefined);

		expect(pull.adopt).toEqual({ A: "" });
	});

	it("keeps a toggle the site doesn't list", () => {
		const pull = pullSiteValues(
			[field("T", ["T"], "bool")],
			{ T: "true" },
			{},
			undefined,
		);

		expect(pull.adopt).toEqual({});
		expect(pull.baseline).toEqual({ T: "true" });
	});
});

describe("pullWholeValue", () => {
	it("adopts the site's value on first sync", () => {
		expect(pullWholeValue("mine", "site", undefined)).toEqual({
			adopt: true,
			baseline: "site",
		});
	});

	it("keeps an edit the site hasn't touched", () => {
		expect(pullWholeValue("edited", "old", "old").adopt).toBe(false);
	});

	it("lets a site change win", () => {
		expect(pullWholeValue("edited", "new", "old").adopt).toBe(true);
	});

	it("adopts the default order when the site removed its order", () => {
		expect(pullWholeValue('{"/":["a"]}', "", '{"/":["a"]}').adopt).toBe(
			true,
		);
	});
});
