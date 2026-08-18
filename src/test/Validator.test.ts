import { hasPublishFlag } from "../publishFile/Validator";

describe("hasPublishFlag", () => {
	it("keeps publishing opt-in by default", () => {
		expect(hasPublishFlag(undefined)).toBe(false);
		expect(hasPublishFlag({})).toBe(false);
		expect(hasPublishFlag({ "dg-publish": true })).toBe(true);
	});

	it("publishes missing flags when publish-by-default is enabled", () => {
		expect(hasPublishFlag(undefined, true)).toBe(true);
		expect(hasPublishFlag({}, true)).toBe(true);
	});

	it("honors an explicit opt-out when publishing by default", () => {
		expect(hasPublishFlag({ "dg-publish": false }, true)).toBe(false);
		expect(hasPublishFlag({ "dg-publish": "false" }, true)).toBe(false);
	});
});
