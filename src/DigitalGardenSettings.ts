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

	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
		dgShowBacklinks: boolean;
		dgShowLocalGraph: boolean;
		dgShowInlineTitle: boolean;
		dgShowFileTree: boolean;
		dgEnableSearch: boolean;
	}
}