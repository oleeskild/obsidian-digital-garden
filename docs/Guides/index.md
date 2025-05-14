---
title: Guides
description: Guides and tutorials for using Quartz Syncer.
created: 2005-05-25T00:00:00+02:00
date: 2025-05-11T17:35:36+02:00
publish: true
---

```dataview
TABLE WITHOUT ID file.link AS Category, file.frontmatter.description AS Description
WHERE file.folder = this.file.folder
WHERE file != this.file
SORT file.frontmatter.title ASC
```
