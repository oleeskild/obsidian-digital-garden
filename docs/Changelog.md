---
title: Roadmap
description: Changelog and feature roadmap for Quartz Syncer.
created: 2025-05-16T12:59:31Z+0200
modified: 2025-05-17T22:39:48Z+0200
publish: true
---

## Upcoming

### Version 1.5.0

- Added to Obsidian Community Plugin list.
- Added separate settings for configuring note properties/frontmatter.
- Added option to only pass valid Quartz properties.
	- This can be overridden by setting the new `Include all properties` option.
- Updated publication center headings to better reflect functionality.
- Cleaned up all unused and redundant functions.
- Finished up all of the essential documentation.

## Planned

- Excalidraw support.
- Canvas support.
- Built-in Quartz Themes support.

## Someday

- Manage Quartz configuration.
- Manage Quartz layout.
- Manage Quartz plugins.

## Released

### Version 1.4.1

- Fixed links to embedded notes resolving to the wrong URL when deploying from a subfolder.

### Version 1.4.0

- Added support for setting a vault folder as Quartz content folder.
	- This setting is recommended for users with mixed content vaults or users who want to dedicate a specific folder to their Quartz site content.
	- Specific folder can be configured in the plugin settings.
- Added configuration option for specifying publish frontmatter key.
	- The default key is `publish`, matching Obsidian Publish's default key.
	- The frontmatter key is used to expose notes to Quartz Syncer. Any note without the specified key or eith they key set to `false`/unchecked checkbox will not show up in Quartz Syncer.
	- The key should be a boolean/Checkbox (source mode/live-preview mode respectively.)
- Added Obsidian commands for modifying a note's publication status:
	- `Quartz Syncer: Add publish flag`: adds the specified publish flag to the current note frontmatter if not already present and sets it to `true`. This exposes the note to Quartz Syncer.
	- `Quartz Syncer: Remove publish flag`: adds the specified publish flag to the current note frontmatter if not already present and sets it to `false`. This hides the note from Quartz Syncer.
	- `Quartz Syncer: Toggle publication status`: toggles the note's visibility to Quartz Syncer.
- Added support for all embed filetypes that Quartz also supports. This includes the following:
	- Note: `md`
	- Image: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`
	- Audio (new): `mp3`, `wav`, `ogg`
	- Video (new): `mp4`, `mkv`, `mov`, `avi`
	- Document (new): `pdf`
- Added a new icon.
- Added this documention website.
- Fixed deleting multiple files in single commit.

### Version 1.3.1

- Fixed Dataview query results not displaying correctly inside nested callouts.

### Version 1.3.0

- Exposed the following options for user configuration in plugin settings view:
	- Pass frontmatter.
	- Image file compression.
	- Use permalink for Quartz URL.
	- Pass note's created date to Quartz.
	- Pass note's last modification date to Quartz.
- Fixed incorrect links to embedded notes.
- Fixed path resolution resolving to wrong path in some cases.

### Version 1.2.0

- Initial beta release as Quartz Syncer.

### Version 1.1.0

- Support for configuring Quartz path.

### Version 1.0.0

- Forked from [Ole Eskild Steensen](https://github.com/oleeskild)'s [Digital Garden plugin](https://github.com/oleeskild/obsidian-digital-garden).
