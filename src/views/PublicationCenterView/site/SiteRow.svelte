<!-- src/views/PublicationCenterView/site/SiteRow.svelte -->
<script lang="ts">
	import Icon from "../../../ui/Icon.svelte";
	import StatusDot from "../StatusDot.svelte";
	import { getSiteContext } from "./siteContext";
	import { formatValue } from "./formatValue";

	/** Field id from SITE_FIELDS (or an asset id); omit for local-only rows. */
	export let id: string | null = null;
	export let name: string;
	export let description = "";
	/** Lay the control out under the label (wide controls). */
	export let stacked = false;

	const { changes, themes, revert } = getSiteContext();

	$: change = id ? $changes.get(id) ?? null : null;
</script>

<div class="setting-item dg-site-row" class:dg-site-row-stacked={stacked}>
	<div class="setting-item-info">
		<div class="setting-item-name">{name}</div>
		{#if description}
			<div class="setting-item-description">{description}</div>
		{/if}
		<slot name="hint" />
		{#if change}
			<div class="dg-site-change">
				<span class="dg-site-change-state">
					<StatusDot status="changed" />
					Not published
				</span>
				{#if change.keys.length > 0}
					<span class="dg-site-change-values">
						Site has {formatValue(change, change.remote, $themes)}.
					</span>
				{/if}
				{#if change.blockedReason}
					<span class="dg-site-change-blocked">
						<Icon name="alert-circle" />
						{change.blockedReason}
					</span>
				{/if}
				<button
					class="dg-link-button"
					on:click={() => change && revert(change)}
				>
					Revert
				</button>
			</div>
		{/if}
	</div>
	<div class="setting-item-control">
		<slot />
	</div>
</div>

<style>
	.dg-site-row-stacked {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}

	.dg-site-row-stacked .setting-item-control {
		justify-content: flex-start;
	}

	.dg-site-row :global(.dg-site-fm) {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.dg-site-change {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		margin-top: 6px;
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.dg-site-change-state {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--text-normal);
		font-weight: var(--font-semibold);
	}

	.dg-site-change-values {
		overflow-wrap: anywhere;
	}

	.dg-site-change-blocked {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-basis: 100%;
		color: var(--text-normal);
	}

	.dg-site-change-blocked :global(.svg-icon) {
		width: 14px;
		height: 14px;
		flex: 0 0 auto;
		color: var(--text-error);
	}

	.dg-link-button {
		height: auto;
		padding: 0;
		background: none;
		border: none;
		box-shadow: none;
		/* Accent pulled toward the text color: readable in light themes too. */
		color: color-mix(in srgb, var(--text-accent) 75%, var(--text-normal));
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
	}
</style>
