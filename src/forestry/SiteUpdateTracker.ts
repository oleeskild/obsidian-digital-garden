import { Notice } from "obsidian";
import { writable, type Writable } from "svelte/store";
import type ForestryApi from "./ForestryApi";
import type { IDeployInfo } from "./DeployInfo";
import type { IUserLimitsResponse } from "./UserLimitsResponse";

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
	phase: SiteUpdatePhase;
	/** True while waiting for the update from a fresh publish to appear. */
	awaitingNewBuild: boolean;
	/** Bumped on each tracked failure; the UI reacts to changes. */
	failureCount: number;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const LIVE_PHASE_MS = 2 * 60 * 1000;

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

	private api: ForestryApi;
	private builds: IDeployInfo[] = [];
	private knownRunIds = new Set<string>();
	private awaitingNewBuild = false;
	private watchedRunId: string | null = null;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private pollDeadline = 0;
	private liveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(api: ForestryApi) {
		this.api = api;

		this.store = writable<SiteUpdateState>({
			builds: [],
			limits: null,
			loaded: false,
			loadFailed: false,
			phase: "idle",
			awaitingNewBuild: false,
			failureCount: 0,
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
		this.awaitingNewBuild = true;
		this.patch({ awaitingNewBuild: true, phase: "queued" });
		this.startPolling();
		void this.tick();
	}

	/** One-off refresh of the update list (e.g. when a view regains focus). */
	refresh() {
		void this.fetchBuilds();
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

	private isSettled(build: IDeployInfo): boolean {
		return (
			build.status === "completed" ||
			build.status === "failed" ||
			build.status === "cancelled"
		);
	}

	private async init() {
		await this.fetchBuilds();
		this.knownRunIds = new Set(this.builds.map((b) => b.runId));

		// Catch up on updates already in flight (or a standing failure)
		// when the plugin loads — quietly, without notices.
		const latest = this.builds[0];

		if (latest && !this.isSettled(latest)) {
			this.patch({
				phase: latest.status === "inprogress" ? "updating" : "queued",
			});
			this.startPolling();
		} else if (latest?.status === "failed") {
			this.patch({ phase: "failed" });
		}

		const limits = await this.api.getUserLimits();
		this.patch({ limits });
	}

	private async fetchBuilds(): Promise<boolean> {
		const result = await this.api.getDeploys("active", 10);

		if (result) {
			this.builds = result;
			this.patch({ builds: result, loaded: true, loadFailed: false });
		} else {
			this.store.update((s) => ({
				...s,
				loadFailed: s.loaded ? s.loadFailed : true,
				loaded: true,
			}));
		}

		return result !== null;
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
		this.patch({ awaitingNewBuild: false });
	}

	private async tick() {
		if (Date.now() > this.pollDeadline) {
			this.stopPolling();
			this.patch({ phase: "idle" });

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
				this.patch({ awaitingNewBuild: false });
			}
		}

		if (this.watchedRunId) {
			const watched = this.builds.find(
				(b) => b.runId === this.watchedRunId,
			);

			if (watched) {
				if (!this.isSettled(watched)) {
					this.patch({
						phase:
							watched.status === "inprogress"
								? "updating"
								: "queued",
					});
				} else if (watched.status === "cancelled") {
					// Superseded by a newer update (e.g. a second publish);
					// go back to waiting for the replacement.
					this.knownRunIds.add(watched.runId);
					this.watchedRunId = null;
					this.awaitingNewBuild = true;
					this.patch({ awaitingNewBuild: true, phase: "queued" });
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
				this.patch({
					phase:
						latest.status === "inprogress" ? "updating" : "queued",
				});
			} else {
				this.stopPolling();

				this.patch({
					phase: latest?.status === "failed" ? "failed" : "idle",
				});
			}
		}
	}

	private announceResult(build: IDeployInfo) {
		if (build.status === "completed") {
			if (build.hasHomePage === false && this.onChooseHomePage) {
				const chooseHomePage = this.onChooseHomePage;

				const notice = new Notice(
					"Your site is live, but has no home page yet. Click to choose one.",
					15000,
				);
				notice.noticeEl.addClass("dg-notice-clickable");

				notice.noticeEl.addEventListener("click", () => {
					notice.hide();
					chooseHomePage();
				});
			} else {
				new Notice("Your site is live 🌱");
			}
			this.patch({ phase: "live" });

			this.liveTimer = setTimeout(() => {
				this.liveTimer = null;
				this.patch({ phase: "idle" });
			}, LIVE_PHASE_MS);
		} else {
			new Notice(
				build.friendlyError?.message
					? `Publish failed: ${build.friendlyError.message}`
					: "Publish failed. See Publish status for details.",
				8000,
			);

			this.store.update((s) => ({
				...s,
				phase: "failed",
				failureCount: s.failureCount + 1,
			}));
		}
	}
}
