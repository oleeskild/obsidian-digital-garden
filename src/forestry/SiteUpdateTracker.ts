import { Notice } from "obsidian";
import { writable, type Writable } from "svelte/store";
import type ForestryApi from "./ForestryApi";
import type { ForestryFailureKind } from "./ForestryApi";
import type { IDeployInfo } from "./DeployInfo";
import type { IUserLimitsResponse } from "./UserLimitsResponse";
import {
	BUILD_HISTORY_LIMIT,
	deriveBuildStatus,
	displayHost,
	isRunning,
	secondsSince,
	siteHref,
} from "./buildStatus";

export type SiteUpdatePhase =
	| "idle"
	| "queued"
	| "updating"
	| "live"
	| "failed";

export interface SiteUpdateState {
	builds: IDeployInfo[];
	limits: IUserLimitsResponse | null;
	loaded: boolean;
	loadFailed: boolean;
	/** Why the builds couldn't be read: a bad Garden Key, or no answer. */
	loadFailedKind: ForestryFailureKind | null;
	phase: SiteUpdatePhase;
	/** True while waiting for the update from a fresh publish to appear. */
	awaitingNewBuild: boolean;
	/** Bumped on each tracked failure; the UI reacts to changes. */
	failureCount: number;
	/** The build a publish started, once it shows up. */
	watchedRunId: string | null;
	/** When the publish being waited on was made (ms), for the timer. */
	awaitingSince: number | null;
	/** Tracking gave up while a build was still unfinished. */
	timedOut: boolean;
	/** ...and Forestry.md never started a build for the publish. */
	timedOutBeforeStart: boolean;
	/** Bumped when something asks to show the publish history. */
	historyRequests: number;
	/** When the stalled publish was made (ms), so the wait keeps counting. */
	stalledSince: number | null;
	/** When the builds were last read (ms). */
	loadedAt: number | null;
	/** The last read failed, so the builds shown may be out of date. */
	refreshFailed: boolean;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * A notice that does something when clicked; also reachable by keyboard
 * (Enter or Space), since Obsidian's notices aren't focusable.
 */
function makeClickable(el: HTMLElement) {
	el.addClass("dg-notice-clickable");
	el.setAttribute("role", "button");
	el.setAttribute("tabindex", "0");

	el.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			el.click();
		}
	});
}

const LIVE_PHASE_MS = 2 * 60 * 1000;
const FAILURE_PIN_SECONDS = 24 * 60 * 60;

/**
 * Plugin-wide tracker for the garden's site updates (Forestry builds).
 * Owns the polling loop and notices so every publish path — commands,
 * Quick Publish, the Publication Center — reports through one place;
 * views and the status bar render from {@link store}.
 *
 * After a publish, the update for the new commit doesn't exist until the
 * server's webhook debounce fires, so it first waits for an unknown runId
 * to appear, then follows it until it settles.
 */
export class SiteUpdateTracker {
	readonly store: Writable<SiteUpdateState>;

	/**
	 * Set by the plugin. When the site goes live without a home page, the
	 * "live" notice becomes clickable and calls this to open the picker.
	 */
	onChooseHomePage: (() => void) | null = null;

	/** Set by the plugin: the site's address, for the "live" notice. */
	siteUrl: (() => string | null) | null = null;

	/** Set by the plugin: opens the publish history (failure notice). */
	onOpenPublishes: (() => void) | null = null;

	private api: ForestryApi;
	private builds: IDeployInfo[] = [];
	private knownRunIds = new Set<string>();
	private awaitingNewBuild = false;
	private watchedRunId: string | null = null;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private pollDeadline = 0;
	private liveTimer: ReturnType<typeof setTimeout> | null = null;
	private timedOut = false;
	private dismissedRunId: string | null = null;
	private awaitingSince: number | null = null;
	private failedReads = 0;

	constructor(api: ForestryApi) {
		this.api = api;

		this.store = writable<SiteUpdateState>({
			builds: [],
			limits: null,
			loaded: false,
			loadFailed: false,
			loadFailedKind: null,
			phase: "idle",
			awaitingNewBuild: false,
			failureCount: 0,
			watchedRunId: null,
			awaitingSince: null,
			timedOut: false,
			timedOutBeforeStart: false,
			historyRequests: 0,
			stalledSince: null,
			loadedAt: null,
			refreshFailed: false,
		});

		void this.init();
	}

	/** Call after anything was pushed to the garden repo. */
	notifyPublished() {
		if (this.liveTimer !== null) {
			clearTimeout(this.liveTimer);
			this.liveTimer = null;
		}
		this.knownRunIds = new Set(this.builds.map((b) => b.runId));
		this.watchedRunId = null;
		this.timedOut = false;
		this.dismissedRunId = null;
		this.awaitingNewBuild = true;
		this.awaitingSince = Date.now();

		this.patch({
			awaitingNewBuild: true,
			phase: "queued",
			watchedRunId: null,
			awaitingSince: this.awaitingSince,
			timedOut: false,
			timedOutBeforeStart: false,
		});
		this.startPolling();
		void this.tick();
	}

	/**
	 * Refresh the update list (e.g. when a view regains focus). An update
	 * still running, maybe started from elsewhere, is followed until it
	 * settles.
	 */
	refresh(): Promise<void> {
		return this.refreshAndFollow();
	}

	private async refreshAndFollow() {
		if (!(await this.fetchBuilds())) return;

		const latest = this.builds[0];

		if (this.pollTimer === null && latest && !this.isSettled(latest)) {
			this.patch({ phase: this.runningPhase(latest) });
			this.startPolling();
		}
	}

	/** Ask the views to open the publish history (e.g. from the status bar). */
	requestHistory() {
		this.store.update((s) => ({
			...s,
			historyRequests: s.historyRequests + 1,
		}));
	}

	/**
	 * Put away a failure or a "taking longer" the user has seen; the build
	 * stays in the history.
	 */
	dismiss() {
		if (this.timedOut) {
			this.timedOut = false;
			this.patch({ timedOut: false, timedOutBeforeStart: false });

			return;
		}
		this.dismissedRunId = this.builds[0]?.runId ?? null;
		this.patch({ phase: "idle" });
	}

	dispose() {
		if (this.pollTimer !== null) clearInterval(this.pollTimer);

		if (this.liveTimer !== null) clearTimeout(this.liveTimer);
		this.pollTimer = null;
		this.liveTimer = null;
	}

	private patch(partial: Partial<SiteUpdateState>) {
		this.store.update((s) => ({ ...s, ...partial }));
	}

	// One classifier for the tracker and the views (buildStatus.ts).
	private isSettled(build: IDeployInfo): boolean {
		return !isRunning(build);
	}

	private runningPhase(build: IDeployInfo): SiteUpdatePhase {
		return deriveBuildStatus(build).label === "Building"
			? "updating"
			: "queued";
	}

	/**
	 * A failure worth pinning: the newest build, not dismissed, and from
	 * the last day. Older ones read as history, not news.
	 */
	private isStandingFailure(build: IDeployInfo | undefined): boolean {
		return (
			!!build &&
			deriveBuildStatus(build).label === "Failed" &&
			build.runId !== this.dismissedRunId &&
			secondsSince(build.createdAt) < FAILURE_PIN_SECONDS
		);
	}

	/**
	 * After tracking timed out, the next fetch that shows the build settled
	 * (or running again) replaces "still building" with what happened.
	 */
	private resolveTimeout() {
		if (!this.timedOut) return;

		const latest = this.builds[0];

		// Only a build from after the publish says how it went.
		if (!latest || this.knownRunIds.has(latest.runId)) return;

		this.timedOut = false;

		if (!this.isSettled(latest)) {
			this.patch({
				timedOut: false,
				timedOutBeforeStart: false,
				phase: this.runningPhase(latest),
			});
			this.startPolling();

			return;
		}

		this.patch({ timedOut: false, timedOutBeforeStart: false });

		if (deriveBuildStatus(latest).label === "Published") {
			this.showLive();
		} else {
			this.patch({
				phase: this.isStandingFailure(latest) ? "failed" : "idle",
			});
		}
	}

	private async init() {
		await this.fetchBuilds();
		this.knownRunIds = new Set(this.builds.map((b) => b.runId));

		// Catch up on updates already in flight (or a standing failure)
		// when the plugin loads — quietly, without notices.
		const latest = this.builds[0];

		if (latest && !this.isSettled(latest)) {
			this.patch({ phase: this.runningPhase(latest) });
			this.startPolling();
		} else if (this.isStandingFailure(latest)) {
			this.patch({ phase: "failed" });
		}

		const limits = await this.api.getUserLimits();
		this.patch({ limits });
	}

	private async fetchBuilds(): Promise<boolean> {
		const result = await this.api.getDeploysResult(
			"active",
			BUILD_HISTORY_LIMIT,
		);

		if (result.ok) {
			this.builds = result.value;
			this.failedReads = 0;

			this.patch({
				builds: result.value,
				loaded: true,
				loadFailed: false,
				loadFailedKind: null,
				loadedAt: Date.now(),
				refreshFailed: false,
			});
			this.resolveTimeout();
		} else {
			this.failedReads++;
			// While following a publish, one missed poll is retried in 5s;
			// say so only when it keeps failing.
			const say = this.pollTimer === null || this.failedReads >= 2;

			this.store.update((s) => ({
				...s,
				loadFailed: s.loaded ? s.loadFailed : true,
				loadFailedKind: result.kind,
				refreshFailed: s.loadedAt !== null && say,
				loaded: true,
			}));
		}

		return result.ok;
	}

	private startPolling() {
		this.pollDeadline = Date.now() + POLL_TIMEOUT_MS;

		if (this.pollTimer !== null) return;

		this.pollTimer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
	}

	private stopPolling() {
		if (this.pollTimer !== null) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		this.awaitingNewBuild = false;
		this.watchedRunId = null;
		this.patch({ awaitingNewBuild: false, awaitingSince: null });
	}

	private async tick() {
		if (Date.now() > this.pollDeadline) {
			// Still unfinished after the timeout: say so instead of going
			// quiet, so the user knows to check the dashboard.
			const stalled = this.awaitingNewBuild || this.watchedRunId !== null;
			const beforeStart = this.awaitingNewBuild;
			const since = this.awaitingSince;
			this.stopPolling();
			this.timedOut = stalled;

			this.patch({
				phase: "idle",
				watchedRunId: null,
				timedOut: stalled,
				timedOutBeforeStart: stalled && beforeStart,
				stalledSince: stalled ? since : null,
			});

			return;
		}

		if (!(await this.fetchBuilds())) return; // transient error, retry

		if (this.awaitingNewBuild) {
			const fresh = this.builds.find(
				(b) => !this.knownRunIds.has(b.runId),
			);

			if (fresh) {
				this.awaitingNewBuild = false;
				this.watchedRunId = fresh.runId;

				this.patch({
					awaitingNewBuild: false,
					watchedRunId: fresh.runId,
				});
			}
		}

		if (this.watchedRunId) {
			const watched = this.builds.find(
				(b) => b.runId === this.watchedRunId,
			);

			if (watched) {
				if (!this.isSettled(watched)) {
					this.patch({ phase: this.runningPhase(watched) });
				} else if (deriveBuildStatus(watched).label === "Cancelled") {
					// Superseded by a newer update (e.g. a second publish);
					// go back to waiting for the replacement.
					this.knownRunIds.add(watched.runId);
					this.watchedRunId = null;
					this.awaitingNewBuild = true;

					this.patch({
						awaitingNewBuild: true,
						phase: "queued",
						watchedRunId: null,
					});
				} else {
					this.announceResult(watched);
					this.stopPolling();
				}
			}

			return;
		}

		// Passive catch-up (updates we didn't trigger): keep refreshing
		// until everything settles, without notices.
		if (!this.awaitingNewBuild) {
			const latest = this.builds[0];

			if (latest && !this.isSettled(latest)) {
				this.patch({ phase: this.runningPhase(latest) });
			} else {
				this.stopPolling();

				this.patch({
					phase: this.isStandingFailure(latest) ? "failed" : "idle",
				});
			}
		}
	}

	private announceResult(build: IDeployInfo) {
		if (deriveBuildStatus(build).label === "Published") {
			if (build.hasHomePage === false && this.onChooseHomePage) {
				const chooseHomePage = this.onChooseHomePage;

				const notice = new Notice(
					"Your site is live, but has no home page yet. Click to choose one.",
					15000,
				);
				makeClickable(notice.noticeEl);

				notice.noticeEl.addEventListener("click", () => {
					notice.hide();
					chooseHomePage();
				});
			} else {
				this.announceLive();
			}
			this.showLive();
		} else {
			const notice = new Notice(
				`${
					build.friendlyError?.message
						? `Publish failed: ${build.friendlyError.message}`
						: "Publish failed."
				} Your site still shows the previous publish. Click for details.`,
				10000,
			);
			makeClickable(notice.noticeEl);

			notice.noticeEl.addEventListener("click", () => {
				notice.hide();
				this.onOpenPublishes?.();
			});

			this.store.update((s) => ({
				...s,
				phase: "failed",
				failureCount: s.failureCount + 1,
			}));
		}
	}

	/** The "live" phase, which folds back to idle after a while. */
	private showLive() {
		if (this.liveTimer !== null) clearTimeout(this.liveTimer);
		this.patch({ phase: "live" });

		this.liveTimer = setTimeout(() => {
			this.liveTimer = null;
			this.patch({ phase: "idle" });
		}, LIVE_PHASE_MS);
	}

	/** "Your site is live", with the address; clicking opens the site. */
	private announceLive() {
		const url = this.siteUrl?.() ?? null;

		if (!url) {
			new Notice("Your site is live.");

			return;
		}

		const message = createFragment((f) => {
			f.createDiv({ text: "Your site is live." });
			f.createDiv({ cls: "dg-notice-address", text: displayHost(url) });
		});
		const notice = new Notice(message, 10000);
		makeClickable(notice.noticeEl);

		notice.noticeEl.addEventListener("click", () => {
			notice.hide();
			window.open(siteHref(url));
		});
	}
}
