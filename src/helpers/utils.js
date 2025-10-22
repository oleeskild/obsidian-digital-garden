const slugify = require("@sindresorhus/slugify");

function headerToId(heading) {
    var slugifiedHeader = slugify(heading);
    if(!slugifiedHeader){
        return heading;
    }
    return slugifiedHeader;
}

function namedHeadings(md, state) {

    var ids = {}

    state.tokens.forEach(function(token, i) {
        if (token.type === 'heading_open') {
            var text = md.renderer.render(state.tokens[i + 1].children, md.options)
            var id = headerToId(text);
            var uniqId = uncollide(ids, id)
            ids[uniqId] = true
            setAttr(token, 'id', uniqId)
        }
    })
}

function uncollide(ids, id) {
    if (!ids[id]) return id
    var i = 1
    while (ids[id + '-' + i]) { i++ }
    return id + '-' + i
}

function setAttr(token, attr, value, options) {
    var idx = token.attrIndex(attr)

    if (idx === -1) {
        token.attrPush([attr, value])
    } else if (options && options.append) {
        token.attrs[idx][1] =
            token.attrs[idx][1] + ' ' + value
    } else {
        token.attrs[idx][1] = value
    }
}

//https://github.com/rstacruz/markdown-it-named-headings/blob/master/index.js
exports.namedHeadingsFilter = function (md, options) {
    md.core.ruler.push('named_headings', namedHeadings.bind(null, md));
}

exports.headerToId = headerToId;