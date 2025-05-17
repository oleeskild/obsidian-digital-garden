---
title: Settings
description: Overview of all settings.
created: 2025-05-07T22:37:11Z+0200
modified: 2025-05-17T18:47:50Z+0200
publish: true
---

## Settings

```dataview
TABLE WITHOUT ID link(file.link, file.frontmatter.title) AS Category, file.frontmatter.description AS Description
WHERE startswith(file.folder, this.file.folder)
WHERE file != this.file
WHERE file.name = "index"
SORT file.frontmatter.title ASC
```

## Commands

| Command | Effect |
| --- | --- |
| `Quartz Syncer: Open publication center` | Opens the modal to manage the Quartz content on GitHub. |
| `Quartz Syncer: Add publish flag` | Adds the configured publish flag to the frontmatter and sets it to `true`. |
| `Quartz Syncer: Remove publish flag` | Adds the configured publish flag to the frontmatter and sets it to `false`. |
| `Quartz Syncer: Toggle publication status` | Adds the configured publish flag to the frontmatter and toggles it between `true` and `false`. |
