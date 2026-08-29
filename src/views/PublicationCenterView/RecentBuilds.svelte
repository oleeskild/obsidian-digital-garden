<!-- src/views/PublicationCenterView/RecentBuilds.svelte -->
<script lang="ts">
	import { onMount } from "svelte";
	import type { SiteUpdateTracker } from "../../forestry/SiteUpdateTracker";
	import type { IDeployInfo } from "../../forestry/DeployInfo";

	export let tracker: SiteUpdateTracker;

	// All polling, notices, and state live in the tracker (shared with the
	// status bar); this component only renders its store.
	const updates = tracker.store;

	let expanded = false;
	let seenFailureCount: number | null = null;

	// Auto-expand the list when a tracked update fails while the view is open.
	$: {
		if (seenFailureCount === null) {
			seenFailureCount = $updates.failureCount;
		} else if ($updates.failureCount > seenFailureCount) {
			seenFailureCount = $updates.failureCount;
			expanded = true;
		}
	}

	$: builds = $updates.builds;
	$: latest = builds[0] ?? null;
	$: awaitingNewBuild = $updates.awaitingNewBuild;
	$: limits = $updates.limits;

	function statusKind(build: IDeployInfo): string {
		if (build.status === "completed") return "success";

		if (build.status === "failed") return "failure";

		if (build.status === "cancelled") return "skipped";

		return "running";
	}

	function statusLabel(build: IDeployInfo): string {
		switch (build.status) {
			case "completed":
				return "Live";
			case "failed":
				return "Publish failed";
			case "cancelled":
				return "Replaced";
			case "inprogress":
				return "Publishing…";
			default:
				return "Queued";
		}
	}

	function timeAgo(iso: string): string {
		const seconds = Math.max(
			0,
			Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
		);

		if (seconds < 60) return "just now";

		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

		return `${Math.floor(seconds / 86400)}d ago`;
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;

		return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	}

	// Re-render relative timestamps every 30s while visible.
	let now = Date.now();

	onMount(() => {
		tracker.refresh();
		const clock = setInterval(() => (now = Date.now()), 30000);

		return () => clearInterval(clock);
	});
</script>

{#if $updates.loaded && !$updates.loadFailed && (latest || awaitingNewBuild)}
	<div class="dg-builds">
		<button
			class="dg-builds-header"
			on:click={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<span class="dg-builds-title">Publish status</span>
			{#if awaitingNewBuild}
				<span class="dg-builds-dot running"></span>
				<span class="dg-builds-summary">Queued…</span>
			{:else if latest}
				{#key now}
					<span class="dg-builds-dot {statusKind(latest)}"></span>
					<span class="dg-builds-summary">
						{statusLabel(latest)} · {timeAgo(latest.createdAt)}
					</span>
				{/key}
			{/if}
			<span class="dg-builds-chevron">{expanded ? "▾" : "▸"}</span>
		</button>

		{#if expanded}
			<div class="dg-builds-list">
				{#if awaitingNewBuild}
					<div class="dg-builds-row">
						<span class="dg-builds-dot running"></span>
						<span>Waiting for publish to start…</span>
					</div>
				{/if}
				{#key now}
					{#each builds as build (build.runId)}
						<div class="dg-builds-row">
							<span class="dg-builds-dot {statusKind(build)}"
							></span>
							<span class="dg-builds-status"
								>{statusLabel(build)}</span
							>
							<span class="dg-builds-meta">
								{timeAgo(build.createdAt)}
								{#if build.durationSeconds != null}
									· {formatDuration(build.durationSeconds)}
								{/if}
								{#if build.branch && build.branch !== "main"}
									· {build.branch}
								{/if}
							</span>
						</div>
						{#if build.status === "failed" && build.friendlyError}
							<div class="dg-builds-error">
								<div>{build.friendlyError.message}</div>
								{#if build.friendlyError.hint}
									<div class="dg-builds-error-hint">
										{build.friendlyError.hint}
									</div>
								{/if}
								{#if build.friendlyError.affectedNotes?.length}
									<ul class="dg-builds-error-notes">
										{#each build.friendlyError.affectedNotes as note}
											<li>{note}</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					{/each}
				{/key}
				{#if limits}
					<div class="dg-builds-limits">
						{limits.builds.monthlyRemaining} of {limits.builds
							.monthlyLimit} publishes left this month
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.dg-builds {
		border-top: 1px solid var(--background-modifier-border);
	}

	.dg-builds-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 12px;
		background: none;
		border: none;
		box-shadow: none;
		cursor: pointer;
		font-size: 0.85rem;
		text-align: left;
	}

	.dg-builds-title {
		font-weight: 600;
	}

	.dg-builds-summary {
		color: var(--text-muted);
	}

	.dg-builds-chevron {
		margin-left: auto;
		color: var(--text-muted);
	}

	.dg-builds-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dg-builds-dot.success {
		background: var(--color-green, #4caf50);
	}

	.dg-builds-dot.failure {
		background: var(--color-red, #f44336);
	}

	.dg-builds-dot.skipped {
		background: var(--text-faint, #999);
	}

	.dg-builds-dot.running {
		background: var(--color-yellow, #ffc107);
		animation: dg-builds-pulse 1.5s ease-in-out infinite;
	}

	@keyframes dg-builds-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.dg-builds-list {
		max-height: 220px;
		overflow-y: auto;
		padding: 0 12px 8px;
	}

	.dg-builds-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 0;
		font-size: 0.85rem;
	}

	.dg-builds-status {
		min-width: 90px;
	}

	.dg-builds-meta {
		color: var(--text-muted);
	}

	.dg-builds-error {
		margin: 2px 0 6px 16px;
		padding: 6px 8px;
		border-left: 2px solid var(--color-red, #f44336);
		background: var(--background-secondary);
		font-size: 0.8rem;
	}

	.dg-builds-error-hint {
		color: var(--text-muted);
		margin-top: 2px;
	}

	.dg-builds-error-notes {
		margin: 4px 0 0;
		padding-left: 16px;
		color: var(--text-muted);
	}

	.dg-builds-limits {
		margin-top: 6px;
		color: var(--text-faint);
		font-size: 0.75rem;
	}
</style>
