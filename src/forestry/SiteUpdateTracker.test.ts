import type { IDeployInfo } from "./DeployInfo";
import type ForestryApi from "./ForestryApi";
import { SiteUpdateTracker, type SiteUpdateState } from "./SiteUpdateTracker";

// Svelte's store module is ESM, which this Jest setup can't load.
jest.mock("svelte/store", () => ({
	writable<T>(value: T) {
		return {
			value,
			set(next: T) {
				this.value = next;
			},
			update(fn: (v: T) => T) {
				this.value = fn(this.value);
			},
			subscribe() {
				return () => {};
			},
		};
	},
}));

const get = <T>(store: unknown) => (store as { value: T }).value as T;

jest.mock(
	"obsidian",
	() => ({
		Notice: class {
			noticeEl = { addClass() {}, addEventListener() {} };
			hide() {}
		},
	}),
	{ virtual: true },
);

const minutesAgo = (m: number) =>
	new Date(Date.now() - m * 60_000).toISOString();

function fakeApi(builds: IDeployInfo[]) {
	return {
		builds,
		getDeploysResult: jest.fn(async function (this: {
			builds: IDeployInfo[];
		}) {
			return { ok: true, value: this.builds };
		}),
		getUserLimits: jest.fn(async () => null),
	};
}

const flush = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("SiteUpdateTracker", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("replaces a timed-out 'still building' with the outcome", async () => {
		const api = fakeApi([
			{
				runId: "a",
				status: "completed",
				conclusion: "success",
				createdAt: minutesAgo(60),
			},
		]);
		const tracker = new SiteUpdateTracker(api as unknown as ForestryApi);
		await flush();

		tracker.notifyPublished();
		await flush();
		// The build never shows up within the timeout.
		jest.advanceTimersByTime(11 * 60_000);
		await flush();
		expect(get<SiteUpdateState>(tracker.store).timedOut).toBe(true);
		// The wait keeps counting from the publish.
		expect(get<SiteUpdateState>(tracker.store).stalledSince).not.toBeNull();

		// Later, a refresh finds it finished.
		api.builds = [
			{
				runId: "b",
				status: "completed",
				conclusion: "success",
				createdAt: minutesAgo(1),
			},
			...api.builds,
		];
		tracker.refresh();
		await flush();

		const state = get<SiteUpdateState>(tracker.store);
		expect(state.timedOut).toBe(false);
		expect(state.phase).toBe("live");
		tracker.dispose();
	});

	it("says a failed refresh, keeping the builds it had", async () => {
		const api = fakeApi([
			{
				runId: "a",
				status: "completed",
				conclusion: "success",
				createdAt: minutesAgo(60),
			},
		]);
		const tracker = new SiteUpdateTracker(api as unknown as ForestryApi);
		await flush();

		api.getDeploysResult.mockResolvedValueOnce({
			ok: false,
			kind: "network",
		} as never);
		tracker.refresh();
		await flush();

		let state = get<SiteUpdateState>(tracker.store);
		expect(state.refreshFailed).toBe(true);
		expect(state.loadFailed).toBe(false);
		expect(state.builds).toHaveLength(1);

		tracker.refresh();
		await flush();
		state = get<SiteUpdateState>(tracker.store);
		expect(state.refreshFailed).toBe(false);
		tracker.dispose();
	});

	it("doesn't pin a failure from days ago", async () => {
		const api = fakeApi([
			{ runId: "a", status: "failed", createdAt: minutesAgo(3 * 1440) },
		]);
		const tracker = new SiteUpdateTracker(api as unknown as ForestryApi);
		await flush();

		expect(get<SiteUpdateState>(tracker.store).phase).toBe("idle");
		tracker.dispose();
	});

	it("pins a recent failure until it's dismissed", async () => {
		const api = fakeApi([
			{ runId: "a", status: "failed", createdAt: minutesAgo(5) },
		]);
		const tracker = new SiteUpdateTracker(api as unknown as ForestryApi);
		await flush();
		expect(get<SiteUpdateState>(tracker.store).phase).toBe("failed");

		tracker.dismiss();
		expect(get<SiteUpdateState>(tracker.store).phase).toBe("idle");
		tracker.dispose();
	});
});
