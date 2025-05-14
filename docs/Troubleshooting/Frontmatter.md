---
title: Frontmatter
description: Documentation related to using Frontmatter.
created: 2004-05-25T00:00:00+02:00
date: 2025-05-11T17:35:47+02:00
publish: true
---

> [!WARNING] Quartz Syncer passes **all** frontmatter tags by default. Please be mindful when publishing.

> [!INFO] Frontmatter usage
> Frontmatter is a way to add metadata to markdown files in YAML format popularized by Jekyll. You can find the Jekyll docs on frontmatter by [clicking here](https://jekyllrb.com/docs/front-matter/).
>
> Quartz Syncer requires the `publish` tag to be set in order for a note to appear in the publishing dialog.
> > [!EXAMPLE]- Minimum frontmatter required for Quartz Syncer
> >
> > ```markdown
> > ---
> > publish: true
> > ---
> > rest of the note here...
> > ```
