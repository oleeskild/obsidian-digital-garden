---
dg-publish: true
---

QA for base cards views with cover thumbnails. Every card below should show an image: the wikilink cover (travolta png), the plain path cover (travolta webp), and the external cover (hotlinked). See the notes in [[B1 Book with wikilink cover|Books]] for the three cover property shapes.

## Embedded base, Obsidian syntax (`image: note.cover`)

This is what Obsidian writes when you pick a card image in the UI:

```base
filters:
  and:
    - file.hasTag("bases-cover-test")
views:
  - type: cards
    name: Covers obsidian syntax
    image: note.cover
    order:
      - file.name
      - year
```

## Embedded base, bare property name (`image: cover`)

```base
filters:
  and:
    - file.hasTag("bases-cover-test")
views:
  - type: cards
    name: Covers bare syntax
    image: cover
    order:
      - file.name
      - year
```

## Transcluded standalone base

![[B4 Covers.base]]

## Grouped by author (note links)

Rows should group under "Ada Lovelace" (linked note title), not raw
wikilink text; the `Editor` value renders as a styled dead link.

```base
filters:
  and:
    - file.hasTag("bases-cover-test")
views:
  - type: table
    name: By author
    groupBy:
      property: Author
      direction: ASC
    order:
      - file.name
      - Author
      - Editor
```
