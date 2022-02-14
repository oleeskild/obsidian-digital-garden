# Obsidian Digital Garden
Publish your notes in your own personal digital garden. 

## Configuration
It's a bit of work to set this all up, but when you're done you'll have a digital garden in which you are in control of every part of it, and can customize it as you see fit. Which is what makes digital gardens so delightful.
Lets get started:

1. First off, you will need a GitHub account. If you don't have this, create one [here](https://github.com/signup).
2. You'll also need a Netlify account. You can sign up using your GitHub account [here](https://app.netlify.com/)
3. Go to [this repo](), and use "Create From Template" button. This will create a new repository in your account. Give it a fitting name like 'my-digital-garden'.
4. Now you need to create an access token so that the plugin can add new notes to the repo on your behalf. Go to [this page](https://github.com/settings/tokens/new?scopes=repo). The correct settings should already be applied. Click the "Generate token" button, and copy the token you are
presented with on the next page. 
5. Now open the settings for "Garden" in obsidian and fill in your github username, the name of the repo with your notes which you created in step 3, and lastly paste in your token. 
6. If you go to you repo in github there should be a button saying "Deploy To Netlify" in your README. Clicking this will publish your site to the internet. Follow the steps. 
7. Now, let's publish your first note! Create a new note in Obsidian. And add this to the top of your file

```
---
tags: gardenEntry
---
```

This tells the plugin that this should be your home page or entry to your digital garden.
8. Open your command pallete by pressing CTRL+P and find the "Garden: Publish Note" command. Press enter.
9. Go to your site's URL which you should find on [Netlify](https://app.netlify.com). If nothing shows up, wait a minute and try again. Your note should now appear

Congratulations, you now have your own digital garden, hosted free of charge.

The code for the website is available in the repo you created in step 3, and this is yours to modify however you want. If you know some css you can change the styling on your page by modifying the styles.css file. 

## Content support
The plugin currently supports rendering of these types of note contents:
* Basic Markdown Syntax
* Code Blocks
* Admonitions
* MathJax
* Transcluded Images


## Advanced
If you want the "versions" functionality you will also need to follow the steps in section "Add netlify environment variables" further down. If you just leave it as is, people will only see the last published version of your note. 

