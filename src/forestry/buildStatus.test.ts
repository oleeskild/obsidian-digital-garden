import {
	buildHeadline,
	deriveBuildStatus,
	displayHost,
	formatDuration,
	liveBuild,
	plantingBuild,
	siteHref,
	siteStatus,
	headlineText,
	shortWhen,
} from "./buildStatus";
import type { IDeployInfo } from "./DeployInfo";

const build = (over: Partial<IDeployInfo>): IDeployInfo => ({
	runId: Math.random().toString(),
	status: "completed",
	conclusion: "success",
	createdAt: "2026-10-27T10:00:00Z",
	...over,
});

describe("deriveBuildStatus", () => {
	it.each([
		["pending", undefined, "Queued"],
		["inprogress", undefined, "Building"],
		["in_progress", undefined, "Building"],
		["completed", undefined, "Failed"],
		["completed", "success", "Published"],
		["completed", "failure", "Failed"],
		["failed", "failure", "Failed"],
		["cancelled", undefined, "Cancelled"],
		["something-new", undefined, "Failed"],
	])("%s / %s → %s", (status, conclusion, label) => {
		expect(deriveBuildStatus(build({ status, conclusion })).label).toBe(
			label,
		);
	});
});

describe("liveBuild", () => {
	it("is the newest successful production build", () => {
		const draft = build({ branch: "draft-1" });
		const failed = build({ status: "failed", conclusion: "failure" });
		const live = build({ branch: "main" });
		const older = build({});

		expect(liveBuild([failed, draft, live, older])).toBe(live);
	});

	it("never counts the run that planted the garden", () => {
		const planting = build({ hasHomePage: false });

		expect(plantingBuild([planting])).toBe(planting);
		expect(liveBuild([planting])).toBeUndefined();
	});

	it("can't tell the planting run when history is cut off", () => {
		const builds = Array.from({ length: 10 }, () => build({}));
		builds[9] = build({ hasHomePage: false });

		expect(plantingBuild(builds)).toBeUndefined();
	});
});

describe("formatting", () => {
	it("formats durations like the dashboard", () => {
		expect(formatDuration(42)).toBe("42s");
		expect(formatDuration(65)).toBe("1m 5s");
		expect(formatDuration(120)).toBe("2m");
		expect(formatDuration(3725)).toBe("1h 2m");
	});

	it("shows and links the site address", () => {
		expect(displayHost("https://ole.forestry.md/")).toBe("ole.forestry.md");
		expect(siteHref("ole.forestry.md")).toBe("https://ole.forestry.md");
		expect(siteHref("http://x.dev")).toBe("http://x.dev");
	});
});

describe("siteStatus", () => {
	it("speaks the dashboard header's words", () => {
		expect(siteStatus([]).label).toBe("Not published yet");

		expect(siteStatus([build({ status: "inprogress" })]).label).toBe(
			"Building",
		);

		expect(
			siteStatus([build({ status: "failed", conclusion: "failure" })])
				.label,
		).toBe("Last publish failed");
		expect(siteStatus([build({}), build({})]).label).toBe("Live");

		expect(
			siteStatus([build({ hasHomePage: false }), build({})]).label,
		).toBe("Live, no home page");
	});

	it("doesn't call a garden that's only been planted live", () => {
		expect(siteStatus([build({ hasHomePage: false })]).label).toBe(
			"Not published yet",
		);
	});
});

describe("buildHeadline", () => {
	it("says what each build did", () => {
		const planting = build({ hasHomePage: false });

		expect(buildHeadline(planting, planting)).toBe(
			"Garden planted, waiting for its first note",
		);
		expect(buildHeadline(build({}), planting)).toBe("Notes published");

		expect(
			buildHeadline(
				build({
					status: "failed",
					friendlyError: { message: "Bad YAML" },
				}),
				undefined,
			),
		).toBe("Bad YAML");
	});
});

describe("shortWhen", () => {
	const now = new Date("2026-10-28T12:00:00Z").getTime();

	it("is relative within a day", () => {
		expect(shortWhen("2026-10-28T11:15:00Z", now)).toBe("45m ago");
	});

	it("is a date after that", () => {
		expect(shortWhen("2026-10-20T12:00:00Z", now)).not.toMatch(/ago/);
	});
});

describe("headlineText", () => {
	it("drops a trailing period", () => {
		expect(headlineText("A note has invalid frontmatter.")).toBe(
			"A note has invalid frontmatter",
		);
	});
});
