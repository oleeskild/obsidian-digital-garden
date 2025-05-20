---
title: Guides
description: Guides and tutorials for using Quartz Syncer.
created: 2025-05-15T00:00:00Z+0200
modified: 2025-05-20T20:32:45Z+0200
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
