import { describeLoadError } from "./loadError";

const httpError = (status: number) =>
	Object.assign(new Error(`Request failed with status ${status}`), {
		status,
	});

describe("describeLoadError", () => {
	it("treats 401 and 403 as a refused connection, per track", () => {
		const github = describeLoadError(httpError(401), false);
		expect(github.cause).toBe("auth");
		expect(github.body).toContain("access token");

		const forestry = describeLoadError(httpError(403), true);
		expect(forestry.cause).toBe("auth");
		expect(forestry.body).toContain("Garden Key");
		expect(forestry.body).not.toContain("GitHub");
	});

	it("treats 404 as a missing garden", () => {
		expect(describeLoadError(httpError(404), false).cause).toBe("notFound");
	});

	it("treats server errors and fetch failures as unreachable", () => {
		expect(describeLoadError(httpError(502), false).cause).toBe("network");

		expect(
			describeLoadError(new TypeError("Failed to fetch"), true).title,
		).toBe("Couldn't reach Forestry.md");
	});

	it("falls back to a generic message and keeps the raw detail", () => {
		const msg = describeLoadError(new Error("boom"), false);
		expect(msg.cause).toBe("unknown");
		expect(msg.detail).toContain("boom");
	});
});
