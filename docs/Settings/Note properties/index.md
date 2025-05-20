---
title: Note properties (frontmatter)
description: Quartz Syncer settings related to note properties or frontmatter.
created: 2025-05-17T15:08:00Z+0200
modified: 2025-05-20T20:31:59Z+0200
publish: true
tags: [settings/frontmatter]
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description, file.frontmatter.default_value AS "Default value"
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
