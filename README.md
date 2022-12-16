# 🏡 Obsidian Digital Garden
Publish your notes in your own personal digital garden. 
Publish your notes to the web, for free. In your own personal garden.

## Docs
Documentation and examples can be found at [dg-docs.ole.dev](https://dg-docs.ole.dev/).

![Digital-Garden-Demo](https://raw.githubusercontent.com/oleeskild/obsidian-digital-garden/main/img/dg-demo.gif)

## Features
The plugin currently supports:
* Basic Markdown Syntax
* Links to other notes
* Dataview queries (currently no support for DataviewJS)
* Backlinks
* Obsidian Themes
* Local graph
* Filetree navigation
* Global search
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

## Initial Setup
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
You can now start adding links as you usually would in Obisidan, with double square brackets like this: [[Some Other Note]], to the note that you just published. You can also link to a specific header by using the syntax [[Some Other Note#A Header]]. Remember to also publish the notes your are linking to as this will not happen automatically. This is by design. You are always in control of what notes you actually want to publish. If you did not publish a linked note, the link will simply lead to a site telling the user that this note does not exist. 

![new-note-demo](https://raw.githubusercontent.com/oleeskild/obsidian-digital-garden/main/img/new-note-demo.gif)

## Modifying the template/site
The code for the website is available in the repo you created in step 3, and this is yours to modify however you want. If you know some css I encourage you to change the default styling to make the site your own. Please modify the custom-style.scss when doing so to avoid
future conflict when updating the template. Netlify should automatically update your site when you make changes to the code.

## Updating the template
In the setting menu for the plugin there is, in addition to the previously mentioned settings, a setting with the name "Site Template" with a button saying "Manage site template". Clicking this should open up a popup-window with the setting "Update site to latest template" and a button saying "Create PR". Whenever digital garden template receives any updates, this button can be used to update your site. It will create a new branch in your repo with the changes and create a Pull Request to your main branch. The plugin will present you with this URL in the setting view. 

If you used the "Deploy to Netlify" button, a Netlify bot will build a preview version of your site which you can visit to see that the changes does not contain any breaking changes. The URL should be visible in the PR. 
When you are ready you can use the "Merge pull request" button on the pull request page to merge the changes into your main branch and make the changes go live.

In the future you will be notified with a visual cue whenever there is an update ready. For now you will need to manually check. If you have the latest version, you will be told so.

---

## Support
This plugin is developed in my free time. If you've found it useful, it would make my day and boost my motivation to invest more time in it if you to showed your support by buying me a coffee.

Note that you in no way have to feel any pressure to do this. The plugin is completely free, and will remain free in the unforeseeable future. 


[<img style="float:left" src="https://user-images.githubusercontent.com/14358394/115450238-f39e8100-a21b-11eb-89d0-fa4b82cdbce8.png" width="200">](https://ko-fi.com/oleeskild)


