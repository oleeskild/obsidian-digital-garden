# Obsidian Digital Garden
Publish your notes in your own personal digital garden. 
An example can be found [here](https://ole.dev/garden)

## Configuration
It's a bit of work to set this all up, but when you're done you'll have a digital garden in which you are in control of every part of it, and can customize it as you see fit. Which is what makes digital gardens so delightful.
Lets get started:

1. First off, you will need a GitHub account. If you don't have this, create one [here](https://github.com/signup).
2. You'll also need a Netlify account. You can sign up using your GitHub account [here](https://app.netlify.com/)
3. Open [this repo](https://github.com/oleeskild/digitalgarden), and click the green "Deploy to netlify" button. This will open netlify which in turn will create a copy of this repository in your GitHub accont. Give it a fitting name like 'my-digital-garden'. Follow the steps to publish your site to the internet.
4. Now you need to create an access token so that the plugin can add new notes to the repo on your behalf. Go to [this page](https://github.com/settings/tokens/new?scopes=repo) while logged in to GitHub. The correct settings should already be applied. If you don't want to generate this every few months, choose the "No expiration" option. Click the "Generate token" button, and copy the token you are presented with on the next page. 
5. Open Obsidian and the settings for "Digital Garden" and fill in your github username, the name of the repo with your notes which you created in step 3, and lastly paste in your token. 
6. Now, let's publish your first note! Create a new note in Obsidian. And add this to the top of your file

```
---
tags: gardenEntry
---
```

This tells the plugin that this should be your home page or entry into your digital garden.

7. Open your command pallete by pressing CTRL+P on Windows/Linux (CMD+P on Mac) and find the "Digital Garden: Publish Note" command. Press enter.

8. Go to your site's URL which you should find on [Netlify](https://app.netlify.com). If nothing shows up yet, wait a minute and refresh. Your note should now appear.

Congratulations, you now have your own digital garden, hosted free of charge! 
You can now start adding links as you usually would in Obisidan, with double square brackets like this: [[Some Other Note]]) to the note that you just published. Remember to also publish the notes your are linking to as this will not happen automatically. This is by design. You are always in control of what notes you actually want to publish. If you did not publish a linked note, the link will simply lead to a site telling the user that this note does not exist. 

The code for the website is available in the repo you created in step 3, and this is yours to modify however you want. If you know some css you can change the styling on your page by modifying the styles.css file. Netlify should automatically update your site when you make changes to the code.

## Content support
The plugin currently supports rendering of these types of note contents:
* Basic Markdown Syntax
* Links to other notes
* Code Blocks
* Admonitions
* MathJax
* Embedded/Transcluded Images
* Transcluded notes
