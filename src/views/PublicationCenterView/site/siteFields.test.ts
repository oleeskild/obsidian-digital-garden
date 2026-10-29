import { applySiteValue, DEFAULT_THEME_VALUE, SITE_FIELDS } from "./siteFields";
import {
	generateEnvValues,
	stringifyEnvValues,
} from "../../../utils/envSettings";
import type DigitalGardenSettings from "../../../models/settings";

const settings = () =>
	({
		theme: DEFAULT_THEME_VALUE,
		baseTheme: "dark",
		siteName: "Garden",
		mainLanguage: "en",
		gardenBaseUrl: "",
		logoHeight: "",
		useFullResolutionImages: false,
		styleSettingsCss: "",
		styleSettingsBodyClasses: "",
		showCreatedTimestamp: false,
		showUpdatedTimestamp: false,
		timestampFormat: "MMM dd",
		defaultNoteIcon: "",
		showNoteIconOnTitle: false,
		showNoteIconInFileTree: false,
		showNoteIconOnInternalLink: false,
		showNoteIconOnBackLink: false,
		defaultNoteSettings: {
			dgHomeLink: true,
			dgPassFrontmatter: false,
			dgShowBacklinks: false,
			dgShowLocalGraph: false,
			dgShowGraphDepthControl: false,
			dgShowInlineTitle: false,
			dgShowFileTree: false,
			dgEnableSearch: false,
			dgShowToc: false,
			dgLinkPreview: false,
			dgShowTags: false,
		},
		uiStrings: {},
	}) as unknown as DigitalGardenSettings;

const sampleValue = (kind: string, key: string) => {
	if (kind === "bool") return "true";

	if (key === "THEME") {
		return "https://raw.githubusercontent.com/owner/Blue-Topaz/HEAD/theme.css";
	}

	if (key === "BASE_THEME") return "light";

	if (key === "SITE_BASE_URL") return "https://garden.example.com";

	return `value for ${key}`;
};

describe("applySiteValue", () => {
	it.each(SITE_FIELDS.flatMap((f) => f.keys.map((k) => [k, f.kind])))(
		"round-trips %s through generateEnvValues",
		(key, kind) => {
			const s = settings();
			const value = sampleValue(kind, key);

			// BASE_THEME is only written alongside a non-default theme.
			if (key === "BASE_THEME") {
				applySiteValue(s, "THEME", sampleValue("theme", "THEME"));
			}
			applySiteValue(s, key, value);

			expect(stringifyEnvValues(generateEnvValues(s))[key]).toBe(value);
		},
	);

	it("names an unknown theme after its repository", () => {
		const s = settings();
		applySiteValue(s, "THEME", sampleValue("theme", "THEME"));
		expect(JSON.parse(s.theme).name).toBe("Blue-Topaz");
	});

	it("falls back to the default theme when the site has none", () => {
		const s = settings();
		applySiteValue(s, "THEME", "");
		expect(s.theme).toBe(DEFAULT_THEME_VALUE);
		expect(generateEnvValues(s).THEME).toBeUndefined();
	});
});
