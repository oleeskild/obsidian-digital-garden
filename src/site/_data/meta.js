require("dotenv").config();
const { globSync } = require("glob");

module.exports = async (data) => {
  let baseUrl = process.env.SITE_BASE_URL || "";
  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = "https://" + baseUrl;
  }
  let themeStyle = globSync("src/site/styles/_theme.*.css")[0] || "";

  // Check for logo file (supports multiple image formats)
  const logoFiles = globSync("src/site/logo.{png,jpg,jpeg,gif,svg,webp}");
  let logoPath = "";
  if (logoFiles.length > 0) {
    // Use the first match and convert to site-relative path
    logoPath = "/" + logoFiles[0].split("src/site/")[1];
  }
  if (themeStyle) {
    themeStyle = themeStyle.split("site")[1];
  }
  let bodyClasses = [];
  let noteIconsSettings = {
    filetree: false,
    links: false,
    title: false,
    default: process.env.NOTE_ICON_DEFAULT,
  };

  const styleSettingsCss = process.env.STYLE_SETTINGS_CSS || "";
  const styleSettingsBodyClasses = process.env.STYLE_SETTINGS_BODY_CLASSES || "";

  if (process.env.NOTE_ICON_TITLE && process.env.NOTE_ICON_TITLE == "true") {
    bodyClasses.push("title-note-icon");
    noteIconsSettings.title = true;
  }
  if (
    process.env.NOTE_ICON_FILETREE &&
    process.env.NOTE_ICON_FILETREE == "true"
  ) {
    bodyClasses.push("filetree-note-icon");
    noteIconsSettings.filetree = true;
  }
  if (
    process.env.NOTE_ICON_INTERNAL_LINKS &&
    process.env.NOTE_ICON_INTERNAL_LINKS == "true"
  ) {
    bodyClasses.push("links-note-icon");
    noteIconsSettings.links = true;
  }
  if (
    process.env.NOTE_ICON_BACK_LINKS &&
    process.env.NOTE_ICON_BACK_LINKS == "true"
  ) {
    bodyClasses.push("backlinks-note-icon");
    noteIconsSettings.backlinks = true;
  }
  if (styleSettingsCss) {
    bodyClasses.push("css-settings-manager");
  }
  if (styleSettingsBodyClasses) {
    bodyClasses.push(styleSettingsBodyClasses);
  }

  let timestampSettings = {
    timestampFormat: process.env.TIMESTAMP_FORMAT || "MMM dd, yyyy h:mm a",
    showCreated: process.env.SHOW_CREATED_TIMESTAMP == "true",
    showUpdated: process.env.SHOW_UPDATED_TIMESTAMP == "true",
  };

  const uiStrings = {
    backlinkHeader: process.env.UI_BACKLINK_HEADER || "Pages mentioning this page",
    noBacklinksMessage: process.env.UI_NO_BACKLINKS_MESSAGE || "No other pages mentions this page",
    searchButtonText: process.env.UI_SEARCH_BUTTON_TEXT || "Search",
    searchPlaceholder: process.env.UI_SEARCH_PLACEHOLDER || "Start typing...",
    searchNotStarted: process.env.UI_SEARCH_NOT_STARTED_TEXT || "Enter your search text in the box above",
    searchEnterHotkey: process.env.UI_SEARCH_ENTER_HOTKEY || "Enter",
    searchEnterHint: process.env.UI_SEARCH_ENTER_HINT || "to select",
    searchNavigateHotkey: process.env.UI_SEARCH_NAVIGATE_HOTKEY || "⇅",
    searchNavigateHint: process.env.UI_SEARCH_NAVIGATE_HINT || "to navigate",
    searchCloseHotkey: process.env.UI_SEARCH_CLOSE_HOTKEY || "ESC",
    searchCloseHint: process.env.UI_SEARCH_CLOSE_HINT || "to close",
    searchNoResults: process.env.UI_SEARCH_NO_RESULTS || "No results for",
    searchPreviewPlaceholder: process.env.UI_SEARCH_PREVIEW_PLACEHOLDER || "Select a result to preview",
    canvasDragHint: process.env.UI_CANVAS_DRAG_HINT || "Drag to pan",
    canvasZoomHint: process.env.UI_CANVAS_ZOOM_HINT || "Scroll to zoom",
    canvasResetHint: process.env.UI_CANVAS_RESET_HINT || "Double-click to reset",
  };

  const meta = {
    env: process.env.ELEVENTY_ENV,
    theme: process.env.THEME,
    themeStyle,
    bodyClasses: bodyClasses.join(" "),
    noteIconsSettings,
    timestampSettings,
    baseTheme: process.env.BASE_THEME || "dark",
    siteName: process.env.SITE_NAME_HEADER || "Digital Garden",
    siteLogoPath: logoPath,
    mainLanguage: process.env.SITE_MAIN_LANGUAGE || "en",
    siteBaseUrl: baseUrl,
    styleSettingsCss,
    uiStrings,
    buildDate: new Date(),
  };

  return meta;
};
