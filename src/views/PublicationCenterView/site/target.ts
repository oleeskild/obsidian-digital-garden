import type { SiteSection } from "./siteFields";

/** A section of the Site tab: the .env sections plus navigation order. */
export type SiteTabSection = SiteSection | "navigation";

/** Where to open the Publication Center. */
export interface CenterTarget {
	tab: "notes" | "site";
	section?: SiteTabSection;
	/** Community garden plugin to select under Plugins, e.g. from a deep link. */
	pluginId?: string;
}
