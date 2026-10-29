import { getContext, setContext } from "svelte";
import type { Readable } from "svelte/store";
import type { App } from "obsidian";
import type DigitalGardenSettings from "../../../models/settings";
import type { SiteChange } from "./siteChanges";
import type { ThemeInfo } from "./siteFields";

export interface SiteContext {
	app: App;
	settings: DigitalGardenSettings;
	isForestry: boolean;
	saveSettings: () => Promise<void>;
	/** Something was written to the site directly; follow its update. */
	notifySiteChanged: () => void;
	changes: Readable<Map<string, SiteChange>>;
	themes: Readable<ThemeInfo[]>;
	/** Save a local edit and recompute what's pending. */
	edit: () => Promise<void>;
	/** Put back the site's value. */
	revert: (change: SiteChange) => Promise<void>;
}

const KEY = "dg-site";

export const setSiteContext = (ctx: SiteContext) => setContext(KEY, ctx);
export const getSiteContext = () => getContext<SiteContext>(KEY);
