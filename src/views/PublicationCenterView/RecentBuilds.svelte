<!-- src/views/PublicationCenterView/RecentBuilds.svelte -->
<script lang="ts">
	import { onMount, tick } from "svelte";
	import { Notice } from "obsidian";
	import type { SiteUpdateTracker } from "../../forestry/SiteUpdateTracker";
	import type { IDeployInfo } from "../../forestry/DeployInfo";
	import {
		deriveBuildStatus,
		displayHost,
		formatDuration,
		GARDENING_MESSAGE_MS,
		GARDENING_MESSAGES,
		isDraftBuild,
		isRunning,
		buildHeadline,
		fullDate,
		headlineText,
		shortWhen,
		liveBuild,
		plantingBuild,
		secondsSince,
		siteHref,
		timeAgo,
		type BuildTone,
	} from "../../forestry/buildStatus";
	import Icon from "../../ui/Icon.svelte";

	export let tracker: SiteUpdateTracker;
	/** The garden's address, for "Live now" and the success notice. */
	export let siteUrl: string | null = null;
	/** The garden's name on Forestry.md, for the publish history link. */
	export let pageName: string | null = null;
	/** The vault path for a note named in a build error, if it exists. */
	export let findNote: (path: string) => string | null = () => null;
	export let openFile: (path: string) => void = () => {};
	/** Opens the home page picker, for a site that's live without one. */
	export let chooseHomePage: (() => void) | null = null;

	// All polling, notices, and state live in the tracker (shared with the
	// status bar); this component only renders its store.
	const updates = tracker.store;

	const historyUrl = pageName
		? `https://dashboard.forestry.md/pages/${encodeURIComponent(
				pageName,
		  )}/overview#publish-history`
		: null;

	const HELP_URL = "https://dashboard.forestry.md/help";

	// Unique per instance; more than one Publication Center can be open.
	const listId = `dg-builds-list-${Math.random().toString(36).slice(2)}`;

	let expanded = false;
	let headerButton: HTMLButtonElement;
	let seenHistoryRequests = $updates.historyRequests;

	// The status bar and the failure notice ask for the history.
	$: if ($updates.historyRequests !== seenHistoryRequests) {
		seenHistoryRequests = $updates.historyRequests;
		expanded = true;
	}

	$: builds = $updates.builds;
	$: latest = builds[0] ?? null;
	$: live = liveBuild(builds);
	$: planting = plantingBuild(builds);
	$: limits = $updates.limits;

	// Failed rows fold open one at a time; their headline already says what
	// went wrong, so they start closed.
	let openRows = new Set<string>();

	function toggleRow(runId: string) {
		const next = new Set(openRows);

		if (next.has(runId)) next.delete(runId);
		else next.add(runId);
		openRows = next;
	}

	// The strip above the publish bar: the publish in flight, then how it
	// ended. Null when there's nothing to follow.
	interface Strip {
		kind: "running" | "live" | "failed" | "stalled";
		/** The status: a pill, or while running, the headline itself. */
		label: string;
		tone: BuildTone;
		/** Before the headline: "Live site:", "Draft:", "Not published:". */
		lead: string | null;
		headline: string;
		/** While running, the muted line after the status. */
		detail: string | null;
		startedAt: number | null;
		build: IDeployInfo | null;
	}

	const leadFor = (build: IDeployInfo | null, fallback: string | null) =>
		build && isDraftBuild(build) ? "Draft:" : fallback;

	// What a publish usually takes, from recent successful ones, so the
	// wait has an end in sight.
	$: typical = (() => {
		const durations = builds
			.filter(
				(b) =>
					b !== planting &&
					deriveBuildStatus(b).label === "Published" &&
					b.durationSeconds != null,
			)
			.slice(0, 5)
			.map((b) => b.durationSeconds as number)
			.sort((a, b) => a - b);

		if (durations.length < 2) return null;

		return durations[Math.floor(durations.length / 2)];
	})();

	// Count from whichever came first, the publish or its build, so the
	// timer never jumps back when the build shows up.
	const startOf = (build: IDeployInfo, awaitingSince: number | null) =>
		Math.min(
			new Date(build.createdAt).getTime(),
			awaitingSince ?? Infinity,
		);

	// The gardening line is picked by the build, so two open views agree.
	const seedOf = (key: string) =>
		[...key].reduce((sum, c) => sum + c.charCodeAt(0), 0);

	let messageStep = 0;

	const gardeningLine = (key: string) =>
		GARDENING_MESSAGES[
			(seedOf(key) + messageStep) % GARDENING_MESSAGES.length
		];

	$: watched = builds.find((b) => b.runId === $updates.watchedRunId) ?? null;

	$: strip = ((): Strip | null => {
		const {
			phase,
			awaitingNewBuild,
			awaitingSince,
			timedOut,
			timedOutBeforeStart,
		} = $updates;

		messageStep; // re-pick the line as it rotates

		if (awaitingNewBuild) {
			return {
				kind: "running",
				label: "Queued",
				tone: "info",
				lead: null,
				headline: "Queued",
				detail: "Waiting for the build to start",
				startedAt: awaitingSince,
				build: null,
			};
		}

		// Followed after a publish, or caught up on (started elsewhere).
		const running =
			watched && isRunning(watched)
				? watched
				: latest && isRunning(latest)
				? latest
				: null;

		if (running) {
			const label = deriveBuildStatus(running).label;

			// The status leads; the gardening line is colour after it.
			return {
				kind: "running",
				label,
				tone: "info",
				lead: leadFor(running, null),
				headline: label,
				// Queued hasn't started; don't claim work that isn't happening.
				detail:
					label === "Queued"
						? "Waiting for the build to start"
						: gardeningLine(running.runId),
				startedAt: startOf(
					running,
					running === watched ? awaitingSince : null,
				),
				build: running,
			};
		}

		if (phase === "live" && live) {
			const homeless = live.hasHomePage === false;

			return {
				kind: "live",
				label: homeless ? "Live, no home page" : "Live now",
				tone: homeless ? "warning" : "success",
				lead: "Live site:",
				headline: homeless
					? "Published, but visitors land on a list of notes"
					: "Notes published",
				detail: null,
				startedAt: null,
				build: live,
			};
		}

		if (phase === "failed" && latest) {
			const status = deriveBuildStatus(latest);

			// The site isn't down: visitors still see the last good publish.
			return {
				kind: "failed",
				label: status.label,
				tone: status.tone,
				lead: leadFor(latest, "Not published:"),
				headline:
					headlineText(latest.friendlyError?.message) ??
					(status.label === "Cancelled"
						? "Replaced by a newer publish"
						: "The build failed"),
				detail: null,
				startedAt: null,
				build: latest,
			};
		}

		if (timedOut) {
			return {
				kind: "stalled",
				label: timedOutBeforeStart ? "Not started" : "Still building",
				tone: "warning",
				lead: null,
				headline: timedOutBeforeStart
					? "Forestry.md hasn't started building yet"
					: "Taking longer than usual",
				detail: null,
				startedAt: $updates.stalledSince,
				build: null,
			};
		}

		return null;
	})();

	const reduceMotion =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

	// A clock for the timer (1s while building) and "3m ago" (otherwise).
	let now = Date.now();
	$: building = strip?.kind === "running";
	// A stall keeps counting, so the wait stays honest.
	$: counting = building || strip?.kind === "stalled";

	// The last read failed: what the strip shows may be old. It says so,
	// greys out, and stops the clock at the last good read.
	$: readFailed =
		$updates.loaded && ($updates.loadFailed || $updates.refreshFailed);
	$: stale = !!strip && readFailed;

	$: elapsedSeconds =
		counting && strip?.startedAt
			? secondsSince(
					new Date(strip.startedAt).toISOString(),
					stale && $updates.loadedAt ? $updates.loadedAt : now,
			  )
			: null;

	// The pill only when nothing before the headline already says it.
	$: stripPill =
		!!strip &&
		!strip.detail &&
		strip.lead !== "Live site:" &&
		strip.lead !== "Not published:";

	// "Check again" says so when nothing changed, rather than looking
	// like it did nothing.
	let checkNote = "";
	const signature = () =>
		`${latest?.runId}:${latest?.status}:${$updates.phase}:${$updates.timedOut}`;

	async function checkAgain() {
		const before = signature();
		checkNote = "";
		await tracker.refresh();
		await tick();

		if ($updates.loadFailed || $updates.refreshFailed) {
			checkNote = "Still couldn't reach Forestry.md";
		} else if (signature() === before) {
			checkNote = "No change yet";
		}
		announcement = checkNote ? `${checkNote}.` : announcement;
	}

	$: strip?.kind, strip?.build?.runId, (checkNote = "");

	$: slow =
		building &&
		typical !== null &&
		elapsedSeconds !== null &&
		elapsedSeconds > typical * 1.5;

	// The one moment of play: the lamp grows into a sprout when a publish
	// this view watched goes live. Still under reduced motion.
	let sproutGrows = false;
	let sawRunning = false;

	$: if (building) sawRunning = true;

	$: if (strip?.kind === "live" && sawRunning) {
		sawRunning = false;
		sproutGrows = !reduceMotion;
	}

	// Phase changes, said once to screen readers. Not the timer, not the
	// rotating line.
	const PHASE_ANNOUNCEMENT = {
		idle: "",
		queued: "Publish queued.",
		updating: "Building your site.",
		live: "Your site is live.",
		failed: "Publish failed.",
	} as const;
	let announcement = "";
	let lastPhase = $updates.phase;

	// "Taking longer" isn't a phase change; say it once when it happens.
	let wasTimedOut = $updates.timedOut;

	$: if ($updates.timedOut !== wasTimedOut) {
		wasTimedOut = $updates.timedOut;

		if (wasTimedOut) {
			announcement = $updates.timedOutBeforeStart
				? "Forestry.md hasn't started building your publish yet."
				: "Your publish is taking longer than usual.";
		}
	}

	$: if ($updates.phase !== lastPhase) {
		lastPhase = $updates.phase;
		announcement = PHASE_ANNOUNCEMENT[$updates.phase];

		if ($updates.phase === "live" && siteUrl) {
			announcement = `Your site is live at ${displayHost(siteUrl)}.`;
		}

		if ($updates.phase === "failed" && latest?.friendlyError?.message) {
			announcement = `Publish failed: ${latest.friendlyError.message}`;
		}
	}

	$: quotaLow =
		!!limits &&
		limits.builds.monthlyRemaining <=
			Math.max(1, Math.floor(limits.builds.monthlyLimit * 0.1));

	// A running count of what's left reads as a meter running down, so
	// the quota stays out of sight until the last fifth of the month's
	// publishes. The exact usage is in the plugin settings.
	$: quotaNear =
		!!limits &&
		limits.builds.monthlyRemaining <=
			Math.max(3, Math.ceil(limits.builds.monthlyLimit * 0.2));

	$: quotaResets = limits?.builds.nextReset
		? `Resets ${new Date(limits.builds.nextReset).toLocaleDateString(
				undefined,
				{ month: "short", day: "numeric" },
		  )}`
		: undefined;

	// For a failure that names exactly one note in this vault: open it.
	$: failedNote = (() => {
		if (strip?.kind !== "failed") return null;

		const found = (strip.build?.friendlyError?.affectedNotes ?? [])
			.map((note) => ({ note, path: findNote(note) }))
			.filter((n): n is { note: string; path: string } => !!n.path);

		return found.length === 1 ? found[0] : null;
	})();

	// The strip already shows its build; the list doesn't repeat it.
	$: rows = strip?.build
		? builds.filter((b) => b.runId !== strip?.build?.runId)
		: builds;

	// The pill says the status; a lead only marks what visitors see now,
	// and drafts.
	function rowLead(build: IDeployInfo) {
		if (build === planting) return null;

		if (isDraftBuild(build)) return "Draft:";

		return build === live ? "Live site:" : null;
	}

	function rowLabel(build: IDeployInfo): { label: string; tone: BuildTone } {
		if (build === planting) return { label: "Planted", tone: "muted" };

		if (build === live) {
			return build.hasHomePage === false
				? { label: "Live, no home page", tone: "warning" }
				: { label: "Live now", tone: "success" };
		}

		return deriveBuildStatus(build);
	}

	// A fade at the bottom of the rows when there's more to scroll to.
	function overflowCue(el: HTMLElement) {
		const update = () =>
			el.classList.toggle(
				"is-clipped",
				el.scrollTop + el.clientHeight < el.scrollHeight - 4,
			);
		const resize = new ResizeObserver(update);
		resize.observe(el);
		el.addEventListener("scroll", update, { passive: true });
		update();

		return {
			destroy() {
				resize.disconnect();
				el.removeEventListener("scroll", update);
			},
		};
	}

	async function dismiss() {
		tracker.dismiss();
		// The button goes away with the strip; keep focus in the panel.
		await tick();
		headerButton?.focus();
	}

	async function copyOutput(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("Copied the build output.");
		} catch {
			new Notice("Couldn't copy. Select the text and copy it instead.");
		}
	}

	onMount(() => {
		tracker.refresh();

		const clock = setInterval(() => {
			// Only tick every second while something is building.
			if ((counting && !stale) || Date.now() - now >= 30000)
				now = Date.now();
		}, 1000);

		const rotate = setInterval(() => {
			if (building && !stale && !reduceMotion) messageStep++;
		}, GARDENING_MESSAGE_MS);

		return () => {
			clearInterval(clock);
			clearInterval(rotate);
		};
	});
</script>

<section class="dg-builds" aria-label="Publishes">
	<div class="dg-sr-only" role="status">{announcement}</div>

	{#snippet stripBlock(strip: Strip)}
		<div
			class="dg-build-strip kind-{strip.kind}"
			class:is-stale={stale}
			role="group"
			aria-label="Current publish"
		>
			<span
				class="dg-lamp tone-{stale ? 'muted' : strip.tone}"
				class:is-sprout={strip.kind === "live"}
				class:grows={strip.kind === "live" && sproutGrows}
				aria-hidden="true"
			>
				{#if strip.kind === "live"}
					<Icon name="sprout" />
				{:else}
					<span
						class="dg-lamp-dot"
						class:pulse={strip.kind === "running" && !stale}
					></span>
				{/if}
			</span>

			<div class="dg-build-strip-main">
				<p class="dg-build-strip-headline">
					{#if strip.lead}
						<span class="dg-muted">{strip.lead}</span>
					{/if}
					<strong>{strip.headline}</strong>
					{#if strip.detail}
						<span class="dg-muted" aria-hidden="true"
							>&nbsp;·&nbsp;</span
						><span class="dg-sr-only">, </span><span
							class="dg-muted">{strip.detail}</span
						>
					{:else if stripPill}
						<span
							class="dg-pill dg-pill-wide tone-{stale
								? 'muted'
								: strip.tone}">{strip.label}</span
						>
					{/if}
				</p>

				{#if strip.kind === "failed" && strip.build?.friendlyError?.hint}
					<p class="dg-build-strip-fix">
						{strip.build.friendlyError.hint}
					</p>
				{/if}

				{#if strip.kind === "stalled" && live}
					<p class="dg-build-strip-fix">
						Your site still shows the publish from {timeAgo(
							live.createdAt,
							now,
						)}.
					</p>
				{/if}

				{#if stale}
					<p class="dg-build-strip-stale">
						{#if $updates.loadFailed}Couldn't load publishes{:else}Couldn't
							refresh{#if $updates.loadedAt}<span class="dg-muted"
									>&nbsp;· as of {timeAgo(
										new Date(
											$updates.loadedAt,
										).toISOString(),
										now,
									)}</span
								>{/if}{/if}<button
							class="dg-link-button"
							on:click={checkAgain}>Check again</button
						>
						{#if checkNote}<span class="dg-muted">{checkNote}</span
							>{/if}
					</p>
				{/if}

				<p class="dg-build-strip-meta">
					<!-- Phones: the pill leads this line instead of wrapping
alone under the headline. -->
					{#if stripPill}
						<span
							class="dg-pill dg-pill-narrow tone-{stale
								? 'muted'
								: strip.tone}">{strip.label}</span
						>
					{/if}

					{#if strip.kind === "running"}
						{#if elapsedSeconds !== null}
							<span>
								{strip.label === "Queued"
									? "Waiting for"
									: "Running for"}
								<span
									class="dg-num dg-timer tone-{stale
										? 'muted'
										: 'info'}"
									>{formatDuration(elapsedSeconds)}</span
								>
							</span>
						{/if}
						{#if slow}
							<span>Longer than usual, still going</span>
						{:else if typical}
							<span>Usually about {formatDuration(typical)}</span>
						{/if}
					{:else if strip.kind === "live"}
						{#if siteUrl}
							<a
								class="dg-build-link"
								href={siteHref(siteUrl)}
								aria-label="Open your site, {displayHost(
									siteUrl,
								)}"
								>{displayHost(siteUrl)}<span aria-hidden="true"
									><Icon name="external-link" /></span
								></a
							>
						{/if}
						{#if strip.build?.hasHomePage === false && chooseHomePage}
							<button
								class="dg-link-button"
								on:click={() => chooseHomePage?.()}
								>Choose home page</button
							>
						{:else if strip.build?.durationSeconds != null}
							<span
								>Took <span class="dg-num"
									>{formatDuration(
										strip.build.durationSeconds,
									)}</span
								></span
							>
						{/if}
					{:else if strip.kind === "failed"}
						{#if failedNote}
							<button
								class="dg-link-button"
								on:click={() =>
									failedNote && openFile(failedNote.path)}
								>Open {failedNote.note}</button
							>
						{/if}
						{#if live}
							<span
								>Your site still shows the publish from {timeAgo(
									live.createdAt,
									now,
								)}.</span
							>
						{/if}
						<!-- Worth saying only when publishes are running out. -->
						{#if limits && quotaLow && strip.label === "Failed" && limits.builds.monthlyRemaining > 0}
							<span
								>Fixing it and publishing again uses 1 of your
								<span class="dg-num"
									>{limits.builds.monthlyRemaining}</span
								> left.</span
							>
						{/if}
						<a class="dg-build-link" href={HELP_URL}
							>Get help<span class="dg-sr-only">
								on Forestry.md</span
							><span aria-hidden="true"
								><Icon name="external-link" /></span
							></a
						>
					{:else}
						{#if elapsedSeconds !== null}
							<span
								>Waiting for <span
									class="dg-num dg-timer tone-{stale
										? 'muted'
										: 'warning'}"
									>{formatDuration(elapsedSeconds)}</span
								></span
							>
						{/if}
						{#if !stale}
							<button
								class="dg-strip-action"
								on:click={checkAgain}>Check again</button
							>
							{#if checkNote}<span>{checkNote}</span>{/if}
						{/if}
						<a class="dg-build-link" href={historyUrl ?? HELP_URL}
							>Open on Forestry.md<span aria-hidden="true"
								><Icon name="external-link" /></span
							></a
						>
					{/if}
				</p>
			</div>

			{#if strip.kind === "failed" || strip.kind === "stalled"}
				<div class="dg-build-strip-end">
					<button
						class="clickable-icon dg-build-dismiss"
						aria-label={strip.build
							? `Dismiss ${
									strip.kind === "failed"
										? "failed"
										: "stalled"
							  } publish. It stays in the history.`
							: "Dismiss"}
						title={strip.build
							? "Dismiss. It stays in the history."
							: "Dismiss"}
						on:click={dismiss}><Icon name="x" /></button
					>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet rowBody(
		build: IDeployInfo,
		status: { label: string; tone: BuildTone },
		failed: boolean,
		open: boolean,
	)}
		{@const lead = rowLead(build)}
		<span class="dg-lamp small tone-{status.tone}" aria-hidden="true">
			<span class="dg-lamp-dot" class:pulse={isRunning(build)}></span>
		</span>
		<span class="dg-builds-row-main">
			<span class="dg-builds-row-headline">
				<!-- Screen readers hear the pill's word first, not the lead too. -->
				<span class="dg-sr-only">{status.label}: </span>{#if lead}<span
						class="dg-muted"
						aria-hidden="true">{lead}</span
					>{" "}{/if}<strong>{buildHeadline(build, planting)}</strong>
			</span>
			{#if isRunning(build)}
				<span class="dg-builds-meta">
					Running for <span class="dg-num"
						>{formatDuration(
							secondsSince(build.createdAt, now),
						)}</span
					>
				</span>
			{:else if build.durationSeconds != null && build !== planting}
				<span class="dg-builds-meta">
					Took <span class="dg-num"
						>{formatDuration(build.durationSeconds)}</span
					>
				</span>
			{/if}
		</span>
		<span class="dg-builds-row-end">
			<span class="dg-pill tone-{status.tone}" aria-hidden="true"
				>{status.label}</span
			>
			<!-- Relative within a day, then a date; the full time on hover and
for screen readers. -->
			<time
				class="dg-builds-meta"
				datetime={build.createdAt}
				title={fullDate(build.createdAt)}
				><span aria-hidden="true"
					>{shortWhen(build.createdAt, now)}</span
				><span class="dg-sr-only">{fullDate(build.createdAt)}</span
				></time
			>
		</span>
		{#if failed}
			<span class="dg-builds-chevron" class:open aria-hidden="true">
				<Icon name="chevron-right" />
			</span>
		{/if}
	{/snippet}

	<!-- Always above the header, open or closed: it never moves. -->
	{#if strip}
		{@render stripBlock(strip)}
	{/if}

	<div class="dg-builds-bar">
		<h3 class="dg-builds-heading">
			<button
				class="dg-builds-header"
				bind:this={headerButton}
				on:click={() => (expanded = !expanded)}
				aria-expanded={expanded}
				aria-controls={listId}
			>
				<span class="dg-builds-chevron" class:open={expanded}>
					<Icon name="chevron-right" />
				</span>
				<span class="dg-builds-title">Publishes</span>
				<!-- The strip already says what's happening; don't say it twice. -->
				{#if !strip}
					<span class="dg-builds-summary">
						{#if !$updates.loaded}
							Checking…
						{:else if $updates.loadFailed}
							Couldn't load publishes
						{:else if latest === planting}
							Planted, no notes yet
						{:else if latest}
							{rowLabel(latest).label}<span aria-hidden="true"
								>&nbsp;·&nbsp;</span
							><span class="dg-sr-only">, </span>{timeAgo(
								latest.createdAt,
								now,
							)}
						{:else}
							No publishes yet
						{/if}
					</span>
				{/if}
			</button>
		</h3>

		<!-- A failed read is said even while the strip shows. -->
		{#if readFailed && !strip}
			<span class="dg-builds-stale">
				{#if !$updates.loadFailed}
					Couldn't refresh{#if $updates.loadedAt}<span
							class="dg-muted"
							>&nbsp;· as of {timeAgo(
								new Date($updates.loadedAt).toISOString(),
								now,
							)}</span
						>{/if}
				{/if}
				<button class="dg-link-button" on:click={checkAgain}
					>Check again</button
				>
				{#if checkNote}<span class="dg-muted">{checkNote}</span>{/if}
			</span>
		{/if}

		{#if limits && quotaNear && limits.builds.monthlyRemaining > 0}
			<span
				class="dg-builds-quota"
				class:is-low={quotaLow}
				title={quotaResets}
			>
				<span class="dg-num">{limits.builds.monthlyRemaining}</span>
				{limits.builds.monthlyRemaining === 1 ? "publish" : "publishes"}
				left this month
			</span>
		{/if}
	</div>

	<!-- Always in the page, so the header's aria-controls resolves. -->
	<div class="dg-builds-list" id={listId} hidden={!expanded}>
		{#if rows.length === 0}
			<p class="dg-muted dg-builds-empty">
				{$updates.loadFailed
					? $updates.loadFailedKind === "unauthorized"
						? "Forestry.md didn't accept your Garden Key. Reconnect your garden in the plugin settings."
						: "Couldn't reach Forestry.md. Check your connection, then try again."
					: builds.length > 0
					? "Earlier publishes show up here."
					: "Publish a note and it shows up here."}
			</p>
		{:else}
			<ol
				class="dg-builds-rows"
				class:has-open={openRows.size > 0}
				use:overflowCue
			>
				{#each rows as build (build.runId)}
					{@const status = rowLabel(build)}
					{@const failed = status.tone === "destructive"}
					{@const open = failed && openRows.has(build.runId)}
					{@const panelId = `${listId}-${build.runId}`}
					<li class="dg-builds-item">
						<!-- Like the dashboard's row: what happened on the left,
						     the result and when on the right. A failed row opens
						     to say why. -->
						{#if failed}
							<!-- Named by status and what happened; the rest is visible text. -->
							<button
								class="dg-builds-row is-toggle"
								aria-label="{status.label}: {buildHeadline(
									build,
									planting,
								)}, {shortWhen(build.createdAt, now)}"
								aria-expanded={open}
								aria-controls={open ? panelId : undefined}
								on:click={() => toggleRow(build.runId)}
								>{@render rowBody(
									build,
									status,
									failed,
									open,
								)}</button
							>
						{:else}
							<div
								class="dg-builds-row"
								class:is-live={build === live}
							>
								{@render rowBody(build, status, failed, open)}
							</div>
						{/if}
						{#if open}
							<div class="dg-builds-error" id={panelId}>
								{#if build.friendlyError?.hint}
									<p>{build.friendlyError.hint}</p>
								{/if}
								{#if build.friendlyError?.affectedNotes?.length}
									<p class="dg-muted">Notes involved:</p>
									<ul class="dg-builds-notes">
										{#each build.friendlyError.affectedNotes as note}
											{@const path = findNote(note)}
											<li>
												{#if path}
													<button
														class="dg-link-button"
														on:click={() =>
															openFile(path)}
														>{note}</button
													>
												{:else}
													{note}
													<span class="dg-muted"
														>(not found in this
														vault)</span
													>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
								<p class="dg-muted">
									Started {fullDate(build.createdAt)}
								</p>
								<div class="dg-builds-help">
									{#if build.errorMessage}
										<details class="dg-builds-raw">
											<summary>Technical details</summary>
											<pre>{build.errorMessage}</pre>
											<button
												class="dg-link-button"
												on:click={() =>
													copyOutput(
														build.errorMessage ??
															"",
													)}>Copy output</button
											>
										</details>
									{/if}
									<a class="dg-build-link" href={HELP_URL}
										>Get help<span class="dg-sr-only">
											on Forestry.md</span
										><span aria-hidden="true"
											><Icon name="external-link" /></span
										></a
									>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ol>

			{#if historyUrl}
				<div class="dg-builds-footer">
					<a class="dg-build-link" href={historyUrl}
						>Publish history<span class="dg-sr-only">
							on Forestry.md</span
						><span aria-hidden="true"
							><Icon name="external-link" /></span
						></a
					>
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.dg-builds {
		border-top: 1px solid var(--background-modifier-border);
		font-size: var(--font-ui-small);
	}

	/* Obsidian's own focus ring is too faint against these surfaces. */
	.dg-builds :global(:is(button, a, summary):focus-visible) {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
		box-shadow: none;
		border-radius: var(--radius-s);
	}

	/* 24px on desktop: a 16px icon with room around it. */
	.dg-build-dismiss {
		padding: 4px;
	}

	.tone-muted {
		--dg-tone: var(--text-muted);
	}

	/* Live: the lamp holds a sprout. It grows in once when a publish this
	   view followed goes live. */
	.dg-lamp.is-sprout {
		color: var(--dg-tone);
	}

	.dg-lamp.is-sprout :global(.svg-icon) {
		width: 13px;
		height: 13px;
	}

	.dg-lamp.grows :global(.svg-icon) {
		transform-origin: 50% 90%;
		animation: dg-sprout-grow 700ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes dg-sprout-grow {
		from {
			transform: scale(0.2) translateY(3px);
			opacity: 0;
		}
		to {
			transform: none;
			opacity: 1;
		}
	}

	/* The fix gets normal ink: it's the most useful line on the strip. */
	.dg-build-strip-fix {
		margin: 2px 0 0;
		font-size: var(--font-ui-smaller);
	}

	.dg-build-strip-headline .dg-pill {
		margin-left: 4px;
		vertical-align: 1px;
	}

	/* An open failure gets all the room it needs, rather than hiding its
	   actions below a second scroll. */
	.dg-builds-rows.has-open {
		max-height: none;
	}

	.dg-builds-rows.is-clipped {
		mask-image: linear-gradient(
			to bottom,
			black calc(100% - 28px),
			transparent
		);
	}

	.dg-builds-item {
		list-style: none;
	}

	.dg-builds-help {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 4px 12px;
	}

	.dg-builds-raw {
		flex: 1 1 100%;
	}

	.dg-muted {
		color: var(--text-muted);
	}

	.dg-num {
		font-variant-numeric: tabular-nums;
	}

	/* Tones: the dashboard's roles in Obsidian's palette. Blue is work in
	   progress, green is live, orange needs a look, red failed. */
	.tone-info {
		--dg-tone: var(--color-blue);
	}

	.tone-success {
		--dg-tone: var(--color-green);
	}

	.tone-warning {
		--dg-tone: var(--color-orange);
	}

	.tone-destructive {
		--dg-tone: var(--color-red);
	}

	/* Obsidian's light-theme greens, oranges and reds are too pale for a
	   small dot on white; deepen them there. */
	:global(.theme-light) .tone-success {
		--dg-tone: color-mix(in srgb, var(--color-green) 65%, black);
	}

	:global(.theme-light) .tone-warning {
		--dg-tone: color-mix(in srgb, var(--color-orange) 75%, black);
	}

	:global(.theme-light) .tone-destructive {
		--dg-tone: color-mix(in srgb, var(--color-red) 85%, black);
	}

	/* A ticking number in its strip's tone. */
	.dg-timer {
		color: color-mix(in srgb, var(--dg-tone) 75%, var(--text-normal));
	}

	/* Old data, said where the claim is. */
	.dg-build-strip-stale {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 0;
		margin: 2px 0 0;
		font-size: var(--font-ui-smaller);
	}

	.dg-build-strip-stale .dg-link-button,
	.dg-builds-stale .dg-link-button {
		margin-inline-start: 10px;
	}

	.dg-build-strip-stale .dg-link-button + .dg-muted,
	.dg-builds-stale .dg-link-button + .dg-muted {
		margin-inline-start: 8px;
	}

	.dg-build-strip.is-stale .dg-build-strip-headline,
	.dg-build-strip.is-stale .dg-build-strip-meta {
		color: var(--text-muted);
	}

	/* The stall's one action. */
	.dg-strip-action {
		height: auto;
		padding: 2px 10px;
		font-size: var(--font-ui-smaller);
	}

	/* The lamp: a status dot in a soft halo of its own colour. */
	.dg-lamp {
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--dg-tone) 18%, transparent);
	}

	.dg-lamp.small {
		width: 16px;
		height: 16px;
	}

	.dg-lamp-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--dg-tone);
	}

	.dg-lamp-dot.pulse {
		animation: dg-lamp-pulse 1.5s ease-in-out infinite;
	}

	@keyframes dg-lamp-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	.dg-pill {
		padding: 1px 6px;
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--dg-tone) 15%, transparent);
		/* Pulled toward the text color: at least 4.5:1 in light and dark. */
		color: color-mix(in srgb, var(--dg-tone) 55%, var(--text-normal));
		font-size: var(--font-ui-smaller);
		font-weight: var(--font-semibold);
		white-space: nowrap;
	}

	/* The strip: the publish in flight, pinned above the publish bar. */
	.dg-build-strip {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
	}

	.dg-build-strip-main {
		flex: 1;
		min-width: 0;
	}

	.dg-build-strip-headline,
	.dg-build-strip-meta {
		margin: 0;
	}

	.dg-build-strip-headline strong {
		font-weight: var(--font-semibold);
	}

	.dg-build-strip-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 12px;
		margin-top: 2px;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.dg-build-strip-end {
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 8px;
	}

	.dg-build-link {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: color-mix(in srgb, var(--text-accent) 75%, var(--text-normal));
	}

	.dg-build-link :global(.svg-icon) {
		width: 12px;
		height: 12px;
	}

	/* The history line. */
	.dg-builds-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px 0 4px;
	}

	.dg-builds-heading {
		display: flex;
		flex: 1;
		min-width: 0;
		margin: 0;
		font: inherit;
	}

	.dg-builds-header {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		min-width: 0;
		height: auto;
		min-height: 32px;
		padding: 4px 8px;
		background: none;
		border: none;
		box-shadow: none;
		font-size: inherit;
		text-align: left;
		cursor: pointer;
	}

	.dg-builds-title {
		flex: 0 0 auto;
		font-weight: var(--font-semibold);
	}

	.dg-builds-summary {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
	}

	.dg-builds-stale {
		display: inline-flex;
		flex: 0 1 auto;
		align-items: center;
		color: var(--text-normal);
		font-size: var(--font-ui-smaller);
	}

	.dg-builds-quota {
		flex: 0 0 auto;
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	.is-low {
		color: color-mix(in srgb, var(--text-warning) 60%, var(--text-normal));
		font-weight: var(--font-medium);
	}

	.dg-builds-chevron {
		display: inline-flex;
		color: var(--text-muted);
		transition: transform 100ms ease-out;
	}

	.dg-builds-chevron.open {
		transform: rotate(90deg);
	}

	.dg-builds-list {
		padding: 4px 12px 10px;
		border-top: 1px solid var(--background-modifier-border);
	}

	/* Only the rows scroll; the current publish and the history link stay
	   in reach. */
	.dg-builds-rows {
		max-height: min(260px, 30vh);
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A row like the dashboard's: lamp, what happened, then the result
	   and when on the right. Failed rows are buttons that fold open. */
	.dg-builds-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		height: auto;
		padding: 6px 8px;
		border: none;
		border-radius: var(--radius-s);
		background: none;
		box-shadow: none;
		color: inherit;
		font: inherit;
		text-align: left;
		/* Obsidian's buttons don't wrap; a row's headline must. */
		white-space: normal;
	}

	.dg-builds-row.is-toggle {
		cursor: pointer;
	}

	@media (hover: hover) {
		.dg-builds-row.is-toggle:hover {
			background: var(--background-modifier-hover);
		}
	}

	.dg-builds-row .dg-lamp {
		margin-top: 1px;
	}

	.dg-builds-row-main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.dg-builds-row-headline strong {
		font-weight: var(--font-semibold);
	}

	.dg-builds-row-end {
		display: flex;
		flex: 0 0 auto;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}

	/* What visitors see now: a light green tint. */
	.dg-builds-row.is-live {
		background: color-mix(in srgb, var(--color-green) 10%, transparent);
	}

	.dg-pill-narrow {
		display: none;
	}

	.dg-builds-meta {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	time.dg-builds-meta {
		font-variant-numeric: tabular-nums;
	}

	/* Small text actions get a bigger hit area than they draw. */
	.dg-link-button,
	.dg-build-link {
		position: relative;
	}

	.dg-link-button::after,
	.dg-build-link::after {
		content: "";
		position: absolute;
		inset: -5px -3px;
	}

	.dg-builds-error {
		margin: 2px 0 6px 30px;
		padding: 8px 10px;
		border-radius: var(--radius-s);
		background: color-mix(in srgb, var(--color-red) 8%, transparent);
		font-size: var(--font-ui-smaller);
	}

	.dg-builds-error p {
		margin: 0 0 4px;
	}

	.dg-builds-notes {
		margin: 0 0 4px;
		padding-left: 16px;
	}

	.dg-builds-raw summary {
		color: var(--text-muted);
		cursor: pointer;
	}

	.dg-builds-raw pre {
		max-height: 160px;
		overflow: auto;
		margin: 4px 0 0;
		padding: 6px 8px;
		border-radius: var(--radius-s);
		background: var(--background-primary);
		font-size: var(--font-ui-smaller);
		white-space: pre-wrap;
	}

	.dg-builds-empty {
		margin: 6px 0;
	}

	.dg-builds-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		margin-top: 8px;
		font-size: var(--font-ui-smaller);
	}

	.dg-link-button {
		height: auto;
		padding: 0;
		background: none;
		border: none;
		box-shadow: none;
		color: color-mix(in srgb, var(--text-accent) 75%, var(--text-normal));
		text-decoration: underline;
		font-size: inherit;
		cursor: pointer;
	}

	/* Phones: the phone gutter, a thumb-sized header, and the quota only
	   when it's running low. */
	@container (max-width: 640px) {
		/* The dismiss sits in the corner so the text keeps the full width. */
		.dg-build-strip {
			position: relative;
			padding: 10px var(--size-4-4);
		}

		.dg-build-strip-end {
			position: absolute;
			top: 0;
			right: 0;
		}

		.dg-build-strip-main {
			padding-right: 28px;
		}

		.dg-builds-bar {
			padding: 0 var(--size-4-4) 0 8px;
		}

		.dg-builds-header {
			min-height: 44px;
		}

		.dg-builds-list {
			padding: 4px var(--size-4-4) 10px;
		}

		.dg-build-dismiss {
			min-width: 44px;
			min-height: 44px;
		}

		.dg-builds-error {
			margin-left: 0;
		}

		/* Thumb-sized targets for the small text actions, without
		   spreading the lines apart. */
		.dg-link-button::after,
		.dg-build-link::after {
			top: 50%;
			bottom: auto;
			height: 44px;
			transform: translateY(-50%);
		}

		.dg-strip-action {
			min-height: 44px;
		}

		/* Room below the last line's tap areas, short of the header. */
		.dg-build-strip {
			padding-bottom: 16px;
		}

		.dg-builds-help {
			row-gap: 16px;
		}

		.dg-build-strip-meta {
			row-gap: 12px;
		}

		/* Room for the time's tap area inside its own row. */
		.dg-builds-row {
			padding: 10px 8px;
		}

		.dg-builds-rows {
			max-height: min(220px, 26vh);
		}

		/* Padding, not flex: a flex summary loses its disclosure marker. */
		.dg-builds-raw summary {
			padding: 13px 0;
		}

		.dg-pill-wide {
			display: none;
		}

		.dg-pill-narrow {
			display: inline-block;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dg-lamp-dot.pulse,
		.dg-lamp.grows :global(.svg-icon) {
			animation: none;
		}

		.dg-builds-chevron {
			transition: none;
		}
	}
</style>
