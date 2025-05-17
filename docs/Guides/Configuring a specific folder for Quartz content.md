---
title: Configuring a specific folder for Quartz content
description: Guide on how to configure a specific folder in your vault for Quartz instead of your entire vault.
created: 2025-05-16T11:22:39Z+0200
modified: 2025-05-17T18:47:50Z+0200
publish: true
---

> [!IMPORTANT] Mixed content vaults
>
> By default, Quartz Syncer assumes your entire vault is used for Quartz content. You can change this behavior by configuring a specific vault folder using the [[Vault root folder name]] setting.

## Configuring a specific vault folder

Open Quartz Syncer settings (`Settings > Community Plugin > Quartz Syncer`) and navigate to the `Vault root folder name` setting. Start typing the folder name in the search box. The search box in this setting automatically matches any folder in your Obsidian vault.

To use your entire vault, set the folder to `/` or leave the search box empty. This is the default behavior.

### Setting effects

> [!HINT] Don't forget to add an `index.md` to your configured vault folder
>
> This `index.md` note will serve as your Quartz website landing page.

When a folder other than the vault root (`/`) is configured, the following changes are made when compiling notes for Quartz:

- All internal links are rewritten to remove the path to the folder.
- If [[Settings/Integrations/Dataview|Dataview integration]] is enabled, all Dataview query results are rewritten to remove the path to the folder.
- All internal embeds links are rewritten to remove the path to the folder.

The final result that is deployed to your Quartz content folder is as if your configured folder is the root of your website.
