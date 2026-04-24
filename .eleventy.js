const slugify = require("@sindresorhus/slugify");
const markdownIt = require("markdown-it");
const fs = require("fs");
const matter = require("gray-matter");
// Obsidian writes [[Page\|Alias]] in frontmatter, but \| is an invalid YAML
// escape sequence. This custom engine strips \| before parsing. Shared between
// Eleventy's own frontmatter parser and the manual matter() call in
// getAnchorAttributes so that wikilink resolution can read the permalink.
const jsYamlForMatter = require(require.resolve("js-yaml", { paths: [require.resolve("gray-matter")] }));
const matterOptions = {
  engines: {
    yaml: {
      parse: (str) => jsYamlForMatter.load(str.replace(/\\\|/g, "|")),
      stringify: (obj) => jsYamlForMatter.dump(obj),
    },
  },
};
const faviconsPlugin = require("eleventy-plugin-gen-favicons");
const tocPlugin = require("eleventy-plugin-nesting-toc");
const { parse } = require("node-html-parser");
const htmlMinifier = require("html-minifier-terser");
const pluginRss = require("@11ty/eleventy-plugin-rss");

const { headerToId, namedHeadingsFilter } = require("./src/helpers/utils");
const {
  userMarkdownSetup,
  userEleventySetup,
} = require("./src/helpers/userSetup");
const { basesPlugin } = require("./src/helpers/basesPlugin");

const Image = require("@11ty/eleventy-img");
function transformImage(src, cls, alt, sizes, widths = ["500", "700", "auto"]) {
  let options = {
    widths: widths,
    formats: ["webp", "jpeg"],
    outputDir: "./dist/img/optimized",
    urlPath: "/img/optimized",
  };

  // generate images, while this is async we don’t wait
  Image(src, options);
  let metadata = Image.statsSync(src, options);
  return metadata;
}

function getAnchorLink(filePath, linkTitle) {
  const { attributes, innerHTML } = getAnchorAttributes(filePath, linkTitle);
  return `<a ${Object.keys(attributes).map(key => `${key}="${attributes[key]}"`).join(" ")}>${innerHTML}</a>`;
}

function getAnchorAttributes(filePath, linkTitle) {
  let fileName = filePath.replaceAll("&amp;", "&");
  let header = "";
  let headerLinkPath = "";
  if (filePath.includes("#")) {
    [fileName, header] = filePath.split("#");
    headerLinkPath = `#${headerToId(header)}`;
  }

  let noteIcon = process.env.NOTE_ICON_DEFAULT;
  const title = linkTitle ? linkTitle : fileName;
  let permalink = `/notes/${slugify(filePath)}`;
  let deadLink = false;
  try {
    const startPath = "./src/site/notes/";
    let fullPath;
    if (fileName.endsWith(".md") || fileName.endsWith(".canvas")) {
      fullPath = `${startPath}${fileName}`;
    } else {
      fullPath = `${startPath}${fileName}.md`;
    }
    const file = fs.readFileSync(fullPath, "utf8");
    const frontMatter = matter(file, matterOptions);
    if (frontMatter.data.permalink) {
      permalink = frontMatter.data.permalink;
    }
    if (
      frontMatter.data.tags &&
      frontMatter.data.tags.indexOf("gardenEntry") != -1
    ) {
      permalink = "/";
    }
    if (frontMatter.data.noteIcon) {
      noteIcon = frontMatter.data.noteIcon;
    }
  } catch {
    deadLink = true;
  }

  if (deadLink) {
    return {
      attributes: {
        "class": "internal-link is-unresolved",
        "href": "/404",
        "target": "",
      },
      innerHTML: title,
    }
  }
  return {
    attributes: {
      "class": "internal-link",
      "target": "",
      "data-note-icon": noteIcon,
      "href": `${permalink}${headerLinkPath}`,
    },
    innerHTML: title,
  }
}

const tagRegex = /(^|\s|\>)(#[^\s!@#$%^&*()=+\.,\[{\]};:'"?><]+)(?!([^<]*>))/g;

const markdownFileTypeRegex = /\.(md|markdown)$/i;
const isMarkdownPage = (inputPath) => inputPath && inputPath.match(markdownFileTypeRegex);

module.exports = function(eleventyConfig) {
  eleventyConfig.setLiquidOptions({
    dynamicPartials: true,
  });

  eleventyConfig.setFrontMatterParsingOptions(matterOptions);
  let markdownLib = markdownIt({
    breaks: true,
    html: true,
    linkify: true,
  })
    .use(require("markdown-it-anchor"), {
      slugify: headerToId,
    })
    .use(require("markdown-it-mark"))
    .use(require("markdown-it-footnote"))
    .use(function(md) {
      md.renderer.rules.hashtag_open = function(tokens, idx) {
        return '<a class="tag" onclick="toggleTagSearch(this)">';
      };
    })
    .use(require("markdown-it-mathjax3"), {
      tex: {
        inlineMath: [["$", "$"]],
      },
      options: {
        skipHtmlTags: { "[-]": ["pre"] },
      },
    })
    .use(require("markdown-it-attrs"))
    .use(require("markdown-it-task-checkbox"), {
      disabled: true,
      divWrap: false,
      divClass: "checkbox",
      idPrefix: "cbx_",
      ulClass: "task-list",
      liClass: "task-list-item",
    })
    .use(require("markdown-it-plantuml"), {
      openMarker: "```plantuml",
      closeMarker: "```",
    })
    .use(namedHeadingsFilter)
    .use(basesPlugin)
    .use(function(md) {
      //https://github.com/DCsunset/markdown-it-mermaid-plugin
      const origFenceRule =
        md.renderer.rules.fence ||
        function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
        const token = tokens[idx];
        if (token.info === "mermaid") {
          const code = token.content.trim();
          return `<pre class="mermaid">${code}</pre>`;
        }
        if (token.info === "transclusion") {
          const code = token.content.trim();
          return `<div class="transclusion">${md.render(code)}</div>`;
        }
        if (token.info === "gist") {
          const code = token.content.trim();
          // Support multiple gist references, one per line
          const gistLines = code.split('\n').filter(line => line.trim());

          const scripts = gistLines.map(line => {
            line = line.trim();
            // Parse format: [username/]gist-id[#filename]
            const parts = line.split('#');
            const gistPath = parts[0];
            const filename = parts[1] || '';

            // Build the GitHub Gist embed URL
            const gistUrl = `https://gist.github.com/${gistPath}.js`;
            const scriptUrl = filename ? `${gistUrl}?file=${encodeURIComponent(filename)}` : gistUrl;

            return `<script src="${scriptUrl}"></script>`;
          });
          return scripts.join('\n');
        }
        if (token.info.startsWith("ad-")) {
          const code = token.content.trim();
          const parts = code.split("\n")
          let titleLine;
          let collapse;
          let collapsible = false
          let collapsed = true
          let icon;
          let color;
          let nbLinesToSkip = 0
          for (let i = 0; i < 4; i++) {
            if (parts[i] && parts[i].trim()) {
              let line = parts[i] && parts[i].trim().toLowerCase()
              if (line.startsWith("title:")) {
                titleLine = line.substring(6);
                nbLinesToSkip++;
              } else if (line.startsWith("icon:")) {
                icon = line.substring(5);
                nbLinesToSkip++;
              } else if (line.startsWith("collapse:")) {
                collapsible = true
                collapse = line.substring(9);
                if (collapse && collapse.trim().toLowerCase() == 'open') {
                  collapsed = false
                }
                nbLinesToSkip++;
              } else if (line.startsWith("color:")) {
                color = line.substring(6);
                nbLinesToSkip++;
              }
            }
          }
          const foldDiv = collapsible ? `<div class="callout-fold">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-chevron-down">
              <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          </div>` : "";
          const titleDiv = titleLine
            ? `<div class="callout-title"><div class="callout-title-inner">${titleLine}</div>${foldDiv}</div>`
            : "";
          let collapseClasses = titleLine && collapsible ? 'is-collapsible' : ''
          if (collapsible && collapsed) {
            collapseClasses += " is-collapsed"
          }

          let res = `<div data-callout-metadata class="callout ${collapseClasses}" data-callout="${token.info.substring(3)
            }">${titleDiv}\n<div class="callout-content">${md.render(
              parts.slice(nbLinesToSkip).join("\n")
            )}</div></div>`;
          return res
        }

        // Other languages
        return origFenceRule(tokens, idx, options, env, slf);
      };

      const defaultImageRule =
        md.renderer.rules.image ||
        function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const imageName = tokens[idx].content;
        //"image.png|metadata?|width"
        const [fileName, ...widthAndMetaData] = imageName.split("|");
        const lastValue = widthAndMetaData[widthAndMetaData.length - 1];
        const lastValueIsNumber = !isNaN(lastValue);
        const width = lastValueIsNumber ? lastValue : null;

        let metaData = "";
        if (widthAndMetaData.length > 1) {
          metaData = widthAndMetaData.slice(0, widthAndMetaData.length - 1).join(" ");
        }

        if (!lastValueIsNumber) {
          metaData += ` ${lastValue}`;
        }

        if (width) {
          const widthIndex = tokens[idx].attrIndex("width");
          const widthAttr = `${width}px`;
          if (widthIndex < 0) {
            tokens[idx].attrPush(["width", widthAttr]);
          } else {
            tokens[idx].attrs[widthIndex][1] = widthAttr;
          }
        }

        return defaultImageRule(tokens, idx, options, env, self);
      };

      const defaultLinkRule =
        md.renderer.rules.link_open ||
        function(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options, env, self);
        };
      function isExternalHref(href) {
        if (!href) return false;
        const trimmed = href.trim();
        if (
          trimmed.startsWith("/") ||
          trimmed.startsWith("#") ||
          trimmed.startsWith("?") ||
          trimmed.startsWith("./") ||
          trimmed.startsWith("../")
        ) {
          return false;
        }
        // Any explicit scheme (http, https, mailto, etc) is treated as external.
        return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
      }

      md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
        const hrefIndex = tokens[idx].attrIndex("href");
        const href =
          hrefIndex >= 0 && tokens[idx].attrs && tokens[idx].attrs[hrefIndex]
            ? tokens[idx].attrs[hrefIndex][1]
            : "";
        const isExternal = isExternalHref(href);

        if (isExternal) {
          const aIndex = tokens[idx].attrIndex("target");
          const classIndex = tokens[idx].attrIndex("class");

          if (aIndex < 0) {
            tokens[idx].attrPush(["target", "_blank"]);
          } else {
            tokens[idx].attrs[aIndex][1] = "_blank";
          }

          if (classIndex < 0) {
            tokens[idx].attrPush(["class", "external-link"]);
          } else if (
            !tokens[idx].attrs[classIndex][1].includes("external-link")
          ) {
            tokens[idx].attrs[classIndex][1] += " external-link";
          }
        } else {
          const classIndex = tokens[idx].attrIndex("class");
          if (classIndex < 0) {
            tokens[idx].attrPush(["class", "internal-link"]);
          } else if (
            !tokens[idx].attrs[classIndex][1].includes("internal-link")
          ) {
            tokens[idx].attrs[classIndex][1] += " internal-link";
          }
        }

        return defaultLinkRule(tokens, idx, options, env, self);
      };
    })
    .use(userMarkdownSetup);

  eleventyConfig.setLibrary("md", markdownLib);

  eleventyConfig.addFilter("isoDate", function(date) {
    return date && date.toISOString();
  });

  eleventyConfig.addFilter("link", function(str) {
    return (
      str &&
      str.replace(/\[\[(.*?\|.*?)\]\]/g, function(match, p1) {
        //Check if it is an embedded excalidraw drawing or mathjax javascript
        if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
          return match;
        }
        const [fileLink, linkTitle] = p1.split("|");

        return getAnchorLink(fileLink, linkTitle);
      })
    );
  });

  eleventyConfig.addFilter("taggify", function(str) {
    return (
      str &&
      str.replace(tagRegex, function(match, precede, tag) {
        return `${precede}<a class="tag" onclick="toggleTagSearch(this)" data-content="${tag}">${tag}</a>`;
      })
    );
  });

  eleventyConfig.addFilter("stripForSearch", function(content) {
    return content
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  });

  eleventyConfig.addFilter("searchableTags", function(str) {
    let tags;
    let match = str && str.match(tagRegex);
    if (match) {
      tags = match
        .map((m) => {
          return `"${m.split("#")[1]}"`;
        })
        .join(", ");
    }
    if (tags) {
      return `${tags},`;
    } else {
      return "";
    }
  });

  eleventyConfig.addFilter("hideDataview", function(str) {
    return (
      str &&
      str.replace(/\(\S+\:\:(.*)\)/g, function(_, value) {
        return value.trim();
      })
    );
  });

  eleventyConfig.addFilter("xmlSafe", function(str) {
    if (!str) return str;
    // Remove invalid XML characters (0xFFFE, 0xFFFF, etc.)
    str = str.replace(/\uFFFE|\uFFFF/g, '');
    // Escape ]]> in content to prevent CDATA issues
    str = str.replace(/\]\]>/g, ']]&gt;');
    // Self-close br, hr, and link tags
    str = str.replace(/<br\s*>/gi, '<br />');
    str = str.replace(/<hr\s*>/gi, '<hr />');
    str = str.replace(/<link([^>]*?)(?<!\/)>/gi, '<link$1 />');
    // Self-close img tags that aren't already self-closed
    str = str.replace(/<img([^>]*?)(?<!\/)>/gi, '<img$1 />');
    return str;
  });

  eleventyConfig.addTransform("dataview-js-links", function(str) {
    if (!isMarkdownPage(this.page.inputPath)) {
      return str;
    }
    const parsed = parse(str);
    for (const dataViewJsLink of parsed.querySelectorAll("a[data-href].internal-link")) {
      const notePath = dataViewJsLink.getAttribute("data-href");
      const title = dataViewJsLink.innerHTML;
      const { attributes, innerHTML } = getAnchorAttributes(notePath, title);
      for (const key in attributes) {
        dataViewJsLink.setAttribute(key, attributes[key]);
      }
      dataViewJsLink.innerHTML = innerHTML;
    }

    return str && parsed.innerHTML;
  });

  // Shared helper to transform callout blockquotes - used by both callout-block transform and canvas-markdown
  const calloutMeta = /\[!([\w-]*)\|?(\s?.*)\](\+|\-){0,1}(\s?.*)/;
  function transformCalloutBlockquotes(blockquotes) {
    for (const blockquote of blockquotes) {
      // Process nested blockquotes first
      transformCalloutBlockquotes(blockquote.querySelectorAll("blockquote"));

      let content = blockquote.innerHTML;

      let titleDiv = "";
      let calloutType = "";
      let calloutMetaData = "";
      let isCollapsable;
      let isCollapsed;
      if (!content.match(calloutMeta)) {
        continue;
      }

      content = content.replace(
        calloutMeta,
        function(metaInfoMatch, callout, metaData, collapse, title) {
          isCollapsable = Boolean(collapse);
          isCollapsed = collapse === "-";
          const titleText = title.replace(/(<\/{0,1}\w+>)/, "")
            ? title
            : `${callout.charAt(0).toUpperCase()}${callout
              .substring(1)
              .toLowerCase()}`;
          const fold = isCollapsable
            ? `<div class="callout-fold"><i icon-name="chevron-down"></i></div>`
            : ``;

          calloutType = callout;
          calloutMetaData = metaData;
          titleDiv = `<div class="callout-title"><div class="callout-title-inner">${titleText}</div>${fold}</div>`;
          return "";
        }
      );

      /* Hacky fix for callouts with only a title */
      if (content === "\n<p>\n") {
        content = "";
      }
      let contentDiv = content ? `\n<div class="callout-content">${content}</div>` : "";

      blockquote.tagName = "div";
      blockquote.classList.add("callout");
      blockquote.classList.add(isCollapsable ? "is-collapsible" : "");
      blockquote.classList.add(isCollapsed ? "is-collapsed" : "");
      blockquote.setAttribute("data-callout", calloutType.toLowerCase());
      calloutMetaData && blockquote.setAttribute("data-callout-metadata", calloutMetaData);
      blockquote.innerHTML = `${titleDiv}${contentDiv}`;
    }
  }

  eleventyConfig.addTransform("callout-block", function(str) {
    if (!isMarkdownPage(this.page.inputPath)) {
      return str;
    }
    const parsed = parse(str);
    transformCalloutBlockquotes(parsed.querySelectorAll("blockquote"));
    return str && parsed.innerHTML;
  });

  function fillPictureSourceSets(src, cls, alt, meta, width, imageTag) {
    imageTag.tagName = "picture";
    let html = `<source
      media="(max-width:480px)"
      srcset="${meta.webp[0].url}"
      type="image/webp"
      />
      <source
      media="(max-width:480px)"
      srcset="${meta.jpeg[0].url}"
      />
      `
    if (meta.webp && meta.webp[1] && meta.webp[1].url) {
      html += `<source
        media="(max-width:1920px)"
        srcset="${meta.webp[1].url}"
        type="image/webp"
        />`
    }
    if (meta.jpeg && meta.jpeg[1] && meta.jpeg[1].url) {
      html += `<source
        media="(max-width:1920px)"
        srcset="${meta.jpeg[1].url}"
        />`
    }
    html += `<img
      class="${cls.toString()}"
      src="${src}"
      alt="${alt}"
      width="${width}"
      />`;
    imageTag.innerHTML = html;
  }


  eleventyConfig.addTransform("picture", function(str) {
    if (!isMarkdownPage(this.page.inputPath)) {
      return str;
    }
    if (process.env.USE_FULL_RESOLUTION_IMAGES === "true") {
      return str;
    }
    const parsed = parse(str);
    for (const imageTag of parsed.querySelectorAll(".cm-s-obsidian img")) {
      const src = imageTag.getAttribute("src");
      if (src && src.startsWith("/") && !src.endsWith(".svg")) {
        const cls = imageTag.classList.value;
        const alt = imageTag.getAttribute("alt");
        const width = imageTag.getAttribute("width") || '';

        try {
          const meta = transformImage(
            "./src/site" + decodeURI(imageTag.getAttribute("src")),
            cls.toString(),
            alt,
            ["(max-width: 480px)", "(max-width: 1024px)"]
          );

          if (meta) {
            fillPictureSourceSets(src, cls, alt, meta, width, imageTag);
          }
        } catch {
          // Make it fault tolarent.
        }
      }
    }
    return str && parsed.innerHTML;
  });

  eleventyConfig.addTransform("table", function(str) {
    if (!isMarkdownPage(this.page.inputPath)) {
      return str;
    }
    const parsed = parse(str);
    for (const t of parsed.querySelectorAll(".cm-s-obsidian > table")) {
      let inner = t.innerHTML;
      t.tagName = "div";
      t.classList.add("table-wrapper");
      t.innerHTML = `<table>${inner}</table>`;
    }

    for (const t of parsed.querySelectorAll(
      ".cm-s-obsidian > .block-language-dataview > table"
    )) {
      t.classList.add("dataview");
      t.classList.add("table-view-table");
      t.querySelector("thead")?.classList.add("table-view-thead");
      t.querySelector("tbody")?.classList.add("table-view-tbody");
      t.querySelectorAll("thead > tr")?.forEach((tr) => {
        tr.classList.add("table-view-tr-header");
      });
      t.querySelectorAll("thead > tr > th")?.forEach((th) => {
        th.classList.add("table-view-th");
      });
    }
    return str && parsed.innerHTML;
  });

  // Helper function to convert wiki-links in canvas text nodes (same logic as link filter)
  function convertCanvasLinks(str) {
    return (
      str &&
      str.replace(/\[\[(.*?\|.*?)\]\]/g, function(match, p1) {
        if (p1.indexOf("],[") > -1 || p1.indexOf('"$"') > -1) {
          return match;
        }
        const [fileLink, linkTitle] = p1.split("|");
        return getAnchorLink(fileLink, linkTitle);
      })
    );
  }

  // Helper function to convert tags in canvas text nodes (same logic as taggify filter)
  function convertCanvasTags(str) {
    return (
      str &&
      str.replace(tagRegex, function(match, precede, tag) {
        return `${precede}<a class="tag" onclick="toggleTagSearch(this)" data-content="${tag}">${tag}</a>`;
      })
    );
  }

  // Render markdown in canvas text nodes at build time
  eleventyConfig.addTransform("canvas-markdown", function(str) {
    if (!str || !str.includes('data-markdown="')) {
      return str;
    }

    try {
      const parsed = parse(str);
      for (const textNode of parsed.querySelectorAll('.canvas-node-text-content[data-markdown]')) {
        const base64Content = textNode.getAttribute('data-markdown');
        if (base64Content) {
          try {
            const markdown = Buffer.from(base64Content, 'base64').toString('utf8');
            // Render markdown
            let rendered = markdownLib.render(markdown);
            // Apply wiki-link conversion (same as link filter)
            rendered = convertCanvasLinks(rendered);
            // Apply tag conversion (same as taggify filter)
            rendered = convertCanvasTags(rendered);
            // Apply callout transformation (reuse shared helper)
            const renderedParsed = parse(rendered);
            transformCalloutBlockquotes(renderedParsed.querySelectorAll("blockquote"));
            rendered = renderedParsed.innerHTML;
            textNode.innerHTML = rendered;
            textNode.removeAttribute('data-markdown');
          } catch (e) {
            // If markdown rendering fails, show raw text as fallback
            console.error('Failed to render canvas markdown:', e);
            const rawText = Buffer.from(base64Content, 'base64').toString('utf8');
            textNode.innerHTML = `<pre>${rawText}</pre>`;
            textNode.removeAttribute('data-markdown');
          }
        }
      }
      return parsed.innerHTML;
    } catch (e) {
      // If parsing fails entirely, return original content
      console.error('Failed to parse canvas content:', e);
      return str;
    }
  });

  eleventyConfig.addTransform("htmlMinifier", async function(content) {
    if (
      (process.env.NODE_ENV === "production" || process.env.ELEVENTY_ENV === "prod") &&
      (this.page.outputPath || "").endsWith(".html")
    ) {
      try {
        return await htmlMinifier.minify(content, {
          useShortDoctype: true,
          removeComments: true,
          collapseWhitespace: true,
          conservativeCollapse: true,
          preserveLineBreaks: true,
          minifyCSS: true,
          minifyJS: true,
          keepClosingSlash: true,
        });
      } catch {
        // If the html minifying fails for some reason due to some malformed text, just return the content as is.
        return content;
      }
    }
    return content;
  });

  eleventyConfig.addTransform("jsonMinifier", async (content, outputPath) => {
    if (
      (process.env.NODE_ENV === "production" || process.env.ELEVENTY_ENV === "prod") &&
      outputPath &&
      outputPath.endsWith(".json")
    ) {
      try {
        return JSON.stringify(JSON.parse(content));
      } catch {
        // If the JSON minifying fails for some reason due to malformed JSON, just return the content as is.
        return content;
      }
    }
    return content;
  });

  eleventyConfig.addPassthroughCopy("src/site/img");
  eleventyConfig.addPassthroughCopy("src/site/scripts");
  eleventyConfig.addPassthroughCopy("src/site/styles/_theme.*.css");
  eleventyConfig.addPassthroughCopy({ "src/site/logo.*": "/" });
  eleventyConfig.addPlugin(faviconsPlugin, { outputDir: "dist" });
  eleventyConfig.addPlugin(tocPlugin, {
    ul: true,
    tags: ["h1", "h2", "h3", "h4", "h5", "h6"],
  });

  // Canvas files are pre-compiled HTML by the plugin - don't process as markdown
  eleventyConfig.addExtension("canvas", {
    read: true,
    compile: async function(inputContent, inputPath) {
      // Extract content after frontmatter (canvas HTML is already compiled by plugin)
      const parsed = matter(inputContent, matterOptions);
      return async (data) => {
        // Return the HTML content directly without markdown processing
        return parsed.content;
      };
    }
  });

  eleventyConfig.addFilter("dateToZulu", function(date) {
    try {
      return new Date(date).toISOString("dd-MM-yyyyTHH:mm:ssZ");
    } catch {
      return "";
    }
  });

  eleventyConfig.addFilter("jsonify", function(variable) {
    return JSON.stringify(variable) || '""';
  });

  eleventyConfig.addFilter("validJson", function(variable) {
    if (Array.isArray(variable)) {
      return variable.map((x) => x.replaceAll("\\", "\\\\")).join(",");
    } else if (typeof variable === "string") {
      return variable.replaceAll("\\", "\\\\");
    }
    return variable;
  });

  eleventyConfig.addPlugin(pluginRss, {
    posthtmlRenderOptions: {
      closingSingleTag: "slash",
      singleTags: ["link"],
    },
  });

  userEleventySetup(eleventyConfig);

  return {
    dir: {
      input: "src/site",
      output: "dist",
      data: `_data`,
    },
    templateFormats: ["njk", "md", "11ty.js", "canvas"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false,
    passthroughFileCopy: true,
  };
};
