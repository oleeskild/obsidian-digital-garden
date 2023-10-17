---
dg-publish: true
---
```dataviewjs
dv.header(2, 'Header 2');
let pg = dv.current().file.name;
dv.paragraph(pg)
```

```dataviewjs
dv.table(["name", "link"],
	dv.pages()
	.where(p => p.file.name.includes("Custom"))
	.map(p => [
 		p.file.name,
 		p.file.link
	])
)
```

