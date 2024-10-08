---
dg-publish: true
---
These codeblocks should not be modified upon publish.

Sample 1
```jinja2
{{ highlight_text }}{% if highlight_location and highlight_location_url %} ([via]({{highlight_location_url}})){% elif highlight_location %} ({{highlight_location}}){% endif %} ^rwhi{{highlight_id}}
{% if highlight_note %}
{{ highlight_note }} ^rwhi{{highlight_id}}-note
{% endif %}
```

Sample 2
```md
In medieval Latin a florilegium (plural florilegia) was a compilation of excerpts from other writings.
 The word is from the Latin flos (flower) and legere (to gather): literally a gathering of flowers, or collection of fine extracts from the body of a larger work. ([via](https://en.wikipedia.org/wiki/Florilegium)) ^rwhi724352030
```

Sample 3
```
This codeblock has a transclusion syntax in it.
Check it out: ![[001 Links]]
```

And for sanity, here's some block references outside of code blocks: foobar ^test-123