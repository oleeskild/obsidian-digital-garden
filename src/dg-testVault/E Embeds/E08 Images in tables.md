---
dg-publish: true
---
Images with resize syntax inside tables should render correctly.
The pipe in the image size syntax is escaped as `\|` inside tables.

| Image | Name |
| ----- | ---- |
| ![[travolta.png\|100]] | Travolta resized |
| ![[travolta.png]] | Travolta full size |
