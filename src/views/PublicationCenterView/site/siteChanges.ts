import type { SiteFieldDef } from "./siteFields";
import type { SiteTabSection } from "./target";

/**
 * A site setting edited in this vault that isn't on the site yet. The site
 * is the source of truth: its values are pulled into the vault on load
 * (see pullSiteValues), so every change here is a local edit.
 */
export interface SiteChange {
	id: string;
	keys: string[];
	section: SiteTabSection;
	label: string;
	field?: SiteFieldDef;
	/** Display values: what you have, and what the site has. */
	local: string;
	remote: string;
	/** Site values to write back for "Revert", per key. */
	remoteValues: Record<string, string>;
	/** Why this change can't be published as it is. */
	blockedReason?: string;
}

const valueOf = (values: Record<string, string>, keys: string[]) =>
	keys.length === 1
		? values[keys[0]] ?? ""
		: JSON.stringify(keys.map((k) => values[k] ?? ""));

/**
 * Compares local values with the site's (as last read or written). A key
 * the site doesn't have counts as empty.
 */
export function computeSiteChanges(
	fields: SiteFieldDef[],
	local: Record<string, string>,
	site: Record<string, string>,
): SiteChange[] {
	const changes: SiteChange[] = [];

	for (const field of fields) {
		const l = valueOf(local, field.keys);
		const r = valueOf(site, field.keys);

		if (l === r) continue;

		changes.push({
			id: field.id,
			keys: field.keys,
			section: field.section,
			label: field.label,
			field,
			local: l,
			remote: r,
			remoteValues: Object.fromEntries(
				field.keys.map((k) => [k, site[k] ?? ""]),
			),
		});
	}

	return changes;
}

export interface SitePull {
	/** Site values to adopt into local settings, per key. */
	adopt: Record<string, string>;
	/** The new record of the site's values. */
	baseline: Record<string, string>;
}

/**
 * Decides how the site's .env updates the vault. The site wins: every key
 * it has is adopted, except a local edit made since the last sync to a key
 * the site hasn't changed meanwhile, which stays pending. A toggle the site
 * doesn't list keeps its local value, since the template default for it is
 * unknown.
 */
export function pullSiteValues(
	fields: SiteFieldDef[],
	local: Record<string, string>,
	remote: Record<string, string>,
	baseline: Record<string, string> | undefined,
): SitePull {
	const adopt: Record<string, string> = {};
	const next = { ...(baseline ?? {}) };

	for (const field of fields) {
		for (const key of field.keys) {
			const l = local[key] ?? "";
			const b = baseline?.[key];

			if (!(key in remote) && field.kind === "bool") {
				if (b === undefined) next[key] = l;
				continue;
			}

			const r = remote[key] ?? "";
			const editedHere = b !== undefined && l !== b;

			if ((!editedHere || r !== b) && l !== r) adopt[key] = r;
			next[key] = r;
		}
	}

	return { adopt, baseline: next };
}

/**
 * The same rule for one whole value, such as the navigation order (as
 * JSON, "" when the site has none): adopt the site's value unless it's
 * unchanged there and edited here.
 */
export function pullWholeValue(
	local: string,
	remote: string,
	baseline: string | undefined,
): { adopt: boolean; baseline: string } {
	const editedHere = baseline !== undefined && local !== baseline;

	return {
		adopt: (!editedHere || remote !== baseline) && local !== remote,
		baseline: remote,
	};
}
