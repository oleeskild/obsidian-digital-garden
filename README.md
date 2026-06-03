# Digital Obsidian Garden
This is the template to be used together with the [Digital Garden Obsidian Plugin](https://github.com/oleeskild/Obsidian-Digital-Garden).
See the README in the plugin repo for information on how to set it up.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oleeskild/digitalgarden)

---
## Docs
Docs are available at [docs.forestry.md](https://docs.forestry.md/)

---
## CSS Variables

The digital garden is fully customizable through CSS variables. Override these in `src/site/styles/custom-style.scss` to customize your garden's appearance.

### How to Customize

Add your overrides to `custom-style.scss`:

```scss
body {
    --dg-content-max-width: 800px;
    --dg-content-font-size: 16px;
    --dg-sidebar-max-width: 400px;
}
```

### Responsive Layout Notes

- Content will never overlap the filetree, regardless of `--dg-content-max-width` value
- The right sidebar (TOC/graph/backlinks) automatically hides when there isn't enough viewport space
- To make the sidebar appear at smaller viewports, reduce `--dg-sidebar-max-width`

### Available Variables

#### Color Variables
You can override the base Obsidian theme color variables directly:

| Variable | Description |
|----------|-------------|
| `--text-normal` | Normal text color |
| `--text-muted` | Muted/secondary text |
| `--text-faint` | Faint text |
| `--text-accent` | Accent color |
| `--text-accent-hover` | Accent hover color |
| `--link-color` | Link color |
| `--link-color-hover` | Link color hover |
| `--link-unresolved-color` | Link color unresolved |
| `--link-unresolved-opacity` | Link color unresolved opacity |
| `--background-primary` | Primary background |
| `--background-primary-alt` | Alt primary background |
| `--background-secondary` | Secondary background |
| `--background-secondary-alt` | Alt secondary background |
| `--interactive-normal` | Interactive element color |
| `--interactive-hover` | Interactive hover color |
| `--interactive-accent` | Interactive accent |
| `--interactive-accent-hover` | Interactive accent hover |

#### Layout Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-content-max-width` | `700px` | Maximum width of content area |
| `--dg-content-margin-top` | `90px` | Top margin for content |
| `--dg-content-margin-top-mobile` | `75px` | Top margin on mobile |
| `--dg-content-font-size` | `18px` | Base font size for content |
| `--dg-content-line-height` | `1.5` | Line height for content |

#### Sidebar (Right) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-sidebar-top` | `75px` | Sidebar top offset |
| `--dg-sidebar-gap` | `80px` | Gap between content and sidebar |
| `--dg-sidebar-min-width` | `25px` | Minimum sidebar width |
| `--dg-sidebar-max-width` | `350px` | Maximum sidebar width |
| `--dg-sidebar-container-padding` | `20px` | Sidebar container padding |
| `--dg-sidebar-container-height` | `87%` | Sidebar container height |

#### Graph Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-graph-width` | `250px` | Local graph width |
| `--dg-graph-height` | `250px` | Local graph height |
| `--dg-graph-border-radius` | `10px` | Graph border radius |
| `--dg-graph-margin-bottom` | `20px` | Graph bottom margin |
| `--dg-graph-fullscreen-width` | `90vw` | Expanded/global graph width |
| `--dg-graph-fullscreen-height` | `85vh` | Expanded/global graph height |
| `--dg-graph-node-color` | `var(--text-accent)` | Active/current node color |
| `--dg-graph-node-color-muted` | `var(--text-faint)` | Neighbor node color |
| `--dg-graph-label-color` | `var(--text-normal)` | Node label text color |
| `--dg-graph-bg` | `var(--background-primary)` | Graph background color |
| `--dg-graph-border-color` | `var(--background-secondary)` | Graph border color |

#### Filetree (Left Sidebar) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-filetree-width` | `250px` | Filetree sidebar width |
| `--dg-filetree-min-width` | `250px` | Minimum filetree width |
| `--dg-filetree-padding` | `10px 20px` | Filetree padding |
| `--dg-filetree-gap` | `80px` | Gap from content |
| `--dg-filetree-title-size` | `32px` | Filetree title font size |

#### TOC (Table of Contents) Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-toc-padding` | `5px` | TOC container padding |
| `--dg-toc-font-size` | `0.9rem` | TOC font size |
| `--dg-toc-max-height` | `220px` | TOC max height |
| `--dg-toc-title-size` | `1.2rem` | TOC title font size |
| `--dg-toc-item-padding` | `2px 0 2px 8px` | TOC item padding |
| `--dg-toc-indent` | `1em` | TOC nested list indent |

#### Backlinks Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-backlinks-margin-top` | `10px` | Backlinks section top margin |
| `--dg-backlinks-max-height` | `250px` | Backlinks list max height |
| `--dg-backlinks-title-size` | `0.9rem` | Backlinks title font size |
| `--dg-backlinks-card-size` | `0.85rem` | Backlink card font size |
| `--dg-backlinks-card-padding` | `6px 0` | Backlink card padding |
| `--dg-backlinks-icon-size` | `14px` | Backlink icon size |

#### Search Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-search-box-width` | `900px` | Search box width |
| `--dg-search-box-max-width` | `80%` | Search box max width |
| `--dg-search-box-radius` | `15px` | Search box border radius |
| `--dg-search-box-padding` | `10px` | Search box padding |
| `--dg-search-input-size` | `2rem` | Search input font size |
| `--dg-search-input-padding` | `10px` | Search input padding |
| `--dg-search-input-radius` | `5px` | Search input border radius |
| `--dg-search-results-max-height` | `50vh` | Search results max height |
| `--dg-search-result-size` | `1.2rem` | Search result font size |
| `--dg-search-result-radius` | `10px` | Search result border radius |
| `--dg-search-link-size` | `1.4rem` | Search link font size |

#### Search Button Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-search-btn-radius` | `8px` | Search button border radius |
| `--dg-search-btn-height` | `32px` | Search button height |
| `--dg-search-btn-padding` | `0 10px` | Search button padding |
| `--dg-search-btn-gap` | `8px` | Search button icon/text gap |
| `--dg-search-btn-font-size` | `0.85rem` | Search button font size |
| `--dg-search-btn-icon-size` | `14px` | Search button icon size |

#### Navbar Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-navbar-title-size-mobile` | `18px` | Navbar title size on mobile |
| `--dg-navbar-search-margin` | `20px` | Navbar search button margin |
| `--dg-navbar-search-min-width` | `36px` | Navbar search min width |
| `--dg-logo-height` | `40px` | Site logo height on desktop |
| `--dg-logo-height-mobile` | `32px` | Site logo height on mobile |
| `--dg-logo-margin` | `10px 15px` | Site logo margin |
| `--dg-filetree-logo-height` | `70px` | Site logo height in filetree sidebar |

#### Note Link / Filetree Item Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-notelink-padding` | `4px 8px 4px 12px` | Note link padding |
| `--dg-notelink-size` | `0.85rem` | Note link font size |
| `--dg-notelink-border-width` | `2px` | Note link left border width |
| `--dg-notelink-hover-bg` | `rgba(255, 255, 255, 0.05)` | Note link hover background |
| `--dg-folder-margin` | `4px 0 4px 2px` | Folder name margin |
| `--dg-folder-icon-size` | `14px` | Folder icon size |
| `--dg-inner-folder-padding` | `3px 0 3px 0` | Inner folder padding |
| `--dg-inner-folder-margin` | `12px` | Inner folder left margin |
| `--dg-filelist-margin` | `8px` | File list left margin |

#### Graph Controls Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-graph-ctrl-padding` | `6px 10px` | Graph controls padding |
| `--dg-graph-ctrl-radius` | `6px` | Graph controls border radius |
| `--dg-graph-ctrl-margin` | `10px` | Graph controls margin |
| `--dg-graph-ctrl-size` | `0.7rem` | Graph controls font size |
| `--dg-graph-ctrl-icon-size` | `14px` | Graph control icon size |
| `--dg-graph-ctrl-gap` | `10px` | Graph controls gap |

#### Timestamps Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-timestamps-size` | `0.8em` | Timestamps font size |
| `--dg-timestamps-gap` | `10px` | Timestamps gap |
| `--dg-timestamps-margin-top` | `20px` | Timestamps top margin |

#### Misc Component Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--dg-overlay-bg` | `rgba(0, 0, 0, 0.5)` | Overlay background color |
| `--dg-mermaid-radius` | `25px` | Mermaid diagram border radius |
| `--dg-mermaid-padding` | `10px` | Mermaid diagram padding |
| `--dg-transclusion-padding` | `8px` | Transclusion container padding |
| `--dg-external-link-icon-size` | `13px` | External link icon size |
| `--dg-external-link-padding` | `16px` | External link right padding |
