export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	gardenBaseUrl: string;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;
}