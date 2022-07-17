# 🌱 Obsidian Digital Garden
Publish your notes in your own personal digital garden. 
An example can be found [here](https://ole.dev/garden).

![Digital-Garden-Demo](https://raw.githubusercontent.com/oleeskild/obsidian-digital-garden/main/img/dg-demo.gif)

## Configuration
It's a bit of work to set this all up, but when you're done you'll have a digital garden in which you are in control of every part of it, and can customize it as you see fit. Which is what makes digital gardens so delightful.
Lets get started:

1. First off, you will need a GitHub account. If you don't have this, create one [here](https://github.com/signup).
2. You'll also need a Netlify account. You can sign up using your GitHub account [here](https://app.netlify.com/)
3. Open [this repo](https://github.com/oleeskild/digitalgarden), and click the green "Deploy to netlify" button. This will open netlify which in turn will create a copy of this repository in your GitHub accont. Give it a fitting name like 'my-digital-garden'. Follow the steps to publish your site to the internet.
4. Now you need to create an access token so that the plugin can add new notes to the repo on your behalf. Go to [this page](https://github.com/settings/tokens/new?scopes=repo) while logged in to GitHub. The correct settings should already be applied. If you don't want to generate this every few months, choose the "No expiration" option. Click the "Generate token" button, and copy the token you are presented with on the next page. 
5. In Obsidian open the setting menu and find the settings for "Digital Garden". The top three settings here is required for the plugin to work. 
Fill in your GitHub username, the name of the repo with your notes which you created in step 3. Lastly paste the token you created in step 4. The other options are optional. You can leave them as is.
6. Now, let's publish your first note! Create a new note in Obsidian. And add the following to the top of your file

```
---
dg-home: true
dg-publish: true
---
```
(If you get backticks, \`\`\`, at the start and beginning when copy-pasting the above text, delete those. It should start and end with a triple dash, ---. See [this page](https://help.obsidian.md/Advanced+topics/YAML+front+matter) for more info about Obsidian and frontmatter.)

**This does two things:**

* The dg-home setting tells the plugin that this should be your home page or entry into your digital garden. (It only needs to be added to _one_ note, not every note you'll publish).

* The dg-publish setting tells the plugin that this note should be published to your digital garden. Notes without this setting will not be published. (In other terms: Every note you publish will need this setting.)

7. Open your command pallete by pressing CTRL+P on Windows/Linux (CMD+P on Mac) and find the "Digital Garden: Publish Single Note" command. Press enter.
8. Go to your site's URL which you should find on [Netlify](https://app.netlify.com). If nothing shows up yet, wait a minute and refresh. Your note should now appear.

Congratulations, you now have your own digital garden, hosted free of charge! 
You can now start adding links as you usually would in Obisidan, with double square brackets like this: [[Some Other Note]]) to the note that you just published. You can also link to a specific header by using the syntax [[Some Other Note#A Header]]. Remember to also publish the notes your are linking to as this will not happen automatically. This is by design. You are always in control of what notes you actually want to publish. If you did not publish a linked note, the link will simply lead to a site telling the user that this note does not exist. 

![new-note-demo](https://raw.githubusercontent.com/oleeskild/obsidian-digital-garden/main/img/new-note-demo.gif)

## Commands

**Digital Garden: Publish Single Note** command will publish the currently active note, and only this.

**Digital Garden: Publish Multiple Notes** command will publish all notes in your vault that have the dg-publish setting set to true that are unpublished or have changed since last publication. It will also delete any notes that are no longer in your vault.
Depending on the number of notes, this may take a while. You can watch the progress of publication in the bottom right statusbar. 

**Copy Garden URL**: This command will copy the URL of the currently active note to your clipboard

**Open Publication Center**: This command behaves the same as the ribbon icon. It will open the publication center where you can view a list what files are published, changed, deleted and not yet published.

## Modifying the template/site
The code for the website is available in the repo you created in step 3, and this is yours to modify however you want. If you know some css I encourage you to change the default styling to make the site your own. Please modify the custom-style.scss when doing so to avoid
future conflict when updating the template. Netlify should automatically update your site when you make changes to the code.

## Updating the template
In the setting menu for the plugin there is, in addition to the previously mentioned settings, a setting with the name "Site Template" with a button saying "Manage site template". Clicking this should open up a popup-window with the setting "Update site to latest template" and a button saying "Create PR". Whenever digital garden template receives any updates, this button can be used to update your site. It will create a new branch in your repo with the changes and create a Pull Request to your main branch. The plugin will present you with this URL in the setting view. 

If you used the "Deploy to Netlify" button, a Netlify bot will build a preview version of your site which you can visit to see that the changes does not contain any breaking changes. The URL should be visible in the PR. 
When you are ready you can use the "Merge pull request" button on the pull request page to merge the changes into your main branch and make the changes go live.

In the future you will be notified with a visual cue whenever there is an update ready. For now you will need to manually check. If you have the latest version, you will be told so.

## Content support
The plugin currently supports rendering of these types of note contents:
* Basic Markdown Syntax
* Links to other notes
* Dataview queries (currently no support for DataviewJS)
* Callouts/Admonitions
* Embedded/Transcluded Excalidraw drawings 
* Embedded/Transcluded Images
* Transcluded notes
* Code Blocks
* MathJax
* Highlighted text
* Footnotes
* Mermaid diagrams
* PlantUML diagrams


## Themes
This plugin support applying any community obsidian theme to your garden. 
In the Digital Garden Settings, there is an Appearance setting. Clicking the "Manage" button brings up a modal which lets you select a theme and optionally a favicon. Click the "Apply settings to site" button for them to take effect to your site. 

Choose the "Default" theme if you want the original Digital Garden theme. 

Leave the favicon setting blank if you want to use the default favicon. 


## Note settings
All notes published with Digital Garden supports settings that can be set via frontmatter. This can either be set on a per-note basis, or you can change the default setting for all notes by changing the settings in the "Settings > Digital Garden > Note Settings - Edit". When changing the default setting, any explicit flag in any note will overwrite the default value. 

### Hiding home link
By default, all notes except the home-note shows a link back to the home-note. If you want this to be hidden in one of your notes (handy if you simply want to share a single note with someone) you can set this property in your frontmatter:

```
---
dg-home-link: false
---
```

## Letting through all frontmatter
By default, only frontmatter recognized by the plugin will be published to GitHub. This is to prevent errors in the template build, if you happen to use a format that the template engine is unfamiliar with. 
If you for some reason want all the frontmatter to be sent through, you can set the following flag in your notes:
```
---
dg-pass-frontmatter: true
---
```

## Advanced usage

### Permalinks
This plugin supports setting your own links to a note, if you prefer something else than the default behaviour.
This is done by adding a dg-permalink attribute to the frontmatter of your file. 
As an example, the top of your file could look like this:

```
---
dg-publish: true
dg-permalink: "mynote"
---
```

This will make the URL to you note be "{Your-Garden-Name}.netlify.app/mynote/". You can still use normal obsidian links as before to link to it. These will be automatically corrected once you publish a note with the permalink attribute. 
Same goes for deleting the attribute. Doing so will result in the note using the default URL. All links in other notes should automatically be corrected and still work.  

The permalinks can be an arbitrary level of folders deep, such as:

```
---
dg-permalink: "category/2022/mynote/"
---
```

### Publish all notes in a specific folder
Some people have requested functionality for publishing all notes in a given folder. To do this, you can combine this plugin with the Templater plugin to create folders which will automatically use a template having the dg-publish attribute set. Thanks to [vanadium23](https://github.com/vanadium23) for [sharing this tip.](https://github.com/oleeskild/obsidian-digital-garden/issues/26#issuecomment-1114321275)

### Transclusion
By default, transclusion of other documents just renders the content as is. If you want to also include a heading on top of the transclusion you can do so by using the pipe character:
```
![[Some Other Note|Heading]]
```

This will add a h1 header with the value "Heading" at the start of your transclusion.

If you want the header to be equal to the title of the transcluded document, you can use this custom syntax:
```
![[Some Other Note|{{title}}]]
```
This will replace the heading with the title of the transcluded document when the note is published.

You can also use the title syntax inside other text:
```
![[Some Other Note|This is a {{title}}]]
```

#### Specifying heading level
You may also specify what heading level you want your transclusion to have. If you want the header to be a h2, you can use this syntax:
```
![[Some Other Note|##Heading]]
```

h4 would look like this:
```
![[Some Other Note|####Heading]]
```

#### Default behaviour
By just using regular translucion, no header will be added:
```
![[Some Other Note]]
```

It's also worth noting that transclusions *do not need* the dg-publish attribute. They behave the same as an image. If you transclude something into a document, and publish that document, everything that is transcluded in it will be published as if it was part of that note. 


