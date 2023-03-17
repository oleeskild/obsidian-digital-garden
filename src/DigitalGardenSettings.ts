export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	gardenBaseUrl: string;
	showRibbonIcon: boolean;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;

	siteName: string;

	noteSettingsIsInitialized: boolean;

	slugifyEnabled: boolean;

	noteIconKey: string;
	defaultNoteIcon: string;
	showNoteIconOnTitle: boolean;
	showNoteIconInFileTree: boolean;
	showNoteIconOnInternalLink: boolean;
	showNoteIconOnBackLink: boolean;

	showCreatedTimestamp: boolean;
	createdTimestampKey: string

	showUpdatedTimestamp: boolean;
	updatedTimestampKey: string;

	timestampFormat: string;

	styleSettingsCss: string;

	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
		dgShowBacklinks: boolean;
		dgShowLocalGraph: boolean;
		dgShowInlineTitle: boolean;
		dgShowFileTree: boolean;
		dgEnableSearch: boolean;
		dgShowToc: boolean;
		dgLinkPreview: boolean;
		dgShowTags: boolean;
	}
}
