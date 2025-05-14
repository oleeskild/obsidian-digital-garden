---
title: Generating a fine-grained access token
description: Guide on how to generated an authentication token for GitHub.
created: 2005-05-25T00:00:00+02:00
date: 2025-05-11T17:35:24+02:00
publish: true
---

> [!IMPORTANT] Expiration dates
> A fine-grained authentication token expires after the specified date. Tokens always expire after one year, even if the expiration date is unset or set further in the future than one year.

## Generating a fine-grained access token

1. Go to [this page](https://github.com/settings/personal-access-tokens/new) and apply the following settings:
	1. *Token name*: The name to identify this token. I'd recommend something that indicates it is for Quartz Syncer, like `Quartz Syncer token`. ![[access-token-name.png]]
	2. *Expiration*: When this token will expire. Defaults to 30 days from now. GitHub will send you and email when your token is about to expire. ![[access-token-expiration-date.png]]
	3. *Repository access*: Select **Only select repositories** and in the drop-down select your Quartz repository. ![[access-token-repository-access.png]]
	4. *Permissions*: Click **Repository permissions** to open all options. ![[access-token-permissions-options.png]]
	5. Scroll to the **Contents** option and change *Access: No access* to *Access: Read and write*. This will allow Quartz Syncer to manage your Quartz' content folder. ![[access-token-contents-permission.png]]
2. Now scroll down and click the button that says **Generate token**. ![[access-token-generate-token-button.png]]
3. A popup with show with the current settings. Click **Generate token** to confirm. ![[access-token-confirmation-popup.png]]
4. Click the copy button to copy the generated access token. ![[access-token-copy-generated-token.png]]
5. Open Obsidian.
6. Open Obsidian's settings and click on **Quartz Syncer** under *Community Plugins*.
7. Paste the generated token in the **GitHub token** field. ![[access-token-obsidian-settings.png]]

## Generating a classic access token

> [!DANGER] Classic access tokens have access to all repositories. If possible, use a fine-grained access token!

To generate a classic access token, [click here](https://github.com/settings/tokens/new?scopes=repo). Add a **Note** and click **Generate token** at the bottom.
