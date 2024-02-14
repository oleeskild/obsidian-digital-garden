# Obsidian Quartz Syncer

Parse, upload and sync your Obsidian notes to your [Quartz](https://github.com/jackyzha0/quartz) website.

**This plugin assumes you have set up a Quartz repository.**

## Initial Setup

Install the plugin by downloading it from the <a href="https://github.com/saberzero1/quartz-syncer/releases">Release Tab</a>, or through the <a href="obsidian://show-plugin?id=obsidian42-brat">Obsidian42 Brat plugin</a>.

After installing, open the plugin settings in Obsidian and set your Github Username, the name of your fork of [Quartz](https://github.com/jackyzha0/quartz), and the authentication token.

Don't have an authentication token yet? You can generate it <a href="https://github.com/settings/tokens/new?scopes=repo">here</a>.

## Publishing notes to Quartz

You can click on the icon in the sidebar or launch the `Quartz Syncer: Open Publication Center` to publish/unpublish notes.

> [!IMPORTANT] On Publishing:
> Notes need a `publish` flag in the notes <a href="https://help.obsidian.md/Editing+and+formatting/Properties">frontmatter</a>. You can add these with the `Quartz Syncer: Add Publish Flag` command, or by adding them to the notes properties manually or via template.

The following frontmatter in a note will cause it to be published when opening the Publication Center:

```yaml
publish: true
```

The following frontmatter in a note will cause it to be shown in the Publication Center, but not published.

```yaml
publish: false
```

The notes will appear in the `content` folder in your chosen repository.

## Credits

This repository is a modified version of <a herf="https://github.com/oleeskild">Ole's</a> <a href="https://github.com/oleeskild/obsidian-digital-garden">Digital Garden plugin</a>. If you found this project useful and want to support it, please support him instead: <a href="https://ko-fi.com/oleeskild">Donation link</a>.