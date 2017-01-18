const { isArray, escapeHtml } = require('sugar-template/lib/utils')
const Context = require('sugar-template/lib/context')
const Exception = require('sugar-template/lib/exception')

function transformHash (hash, context) {
    const res = {}
    for (let p in hash) {
        if (hash[p].type === 'name') {
            res[p] = context.lookup(hash[p].value)
        } else {
            res[p] = hash[p].value
        }
    }
    return res
}

const renderer = {
    Text (options, token) {
        return token.value
    },
    RawValue (options, token, context) {
        const value = context.lookup(token.value)
        return value == null ? '' : value
    },
    Value (options, token, context) {
        const value = context.lookup(token.value)
        return value == null ? '' : escapeHtml(value)
    },
    IgnoreCompile (options, token) {
        return token.value
    },
    Filter (options, token, context, template) {
        const data = token.name && context.lookup(token.name)
        let value = data
        let filter
        token.filters.forEach(v => {
            filter = options.filters[v.name]
            if (!filter) {
                throw new Exception(`Miss filter#${v.name}`, token.loc.start, template || '')
            }
            value = filter(value, transformHash(v.hash, context))
        })
        return value == null ? '' : escapeHtml(value)
    },
    InlineHelper (options, token, context, template) {
        const helper = options.helpers[token.name]
        if (!helper) {
            throw new Exception(`Miss helper#${token.name}`, token.loc.start, template || '')
        }
        let data = token.params.context
        if (data) {
            data = data.type === 'name' ? context.lookup(data.value) : data.value
        }
        if (!options.resourceMap[token.name]) {
            options.resourceMap[token.name] = []
        }
        const value = helper.call(
            context,
            data,
            {
                fn () { return '' },
                inverse () { return '' },
                hash: transformHash(token.params.hash, context),
                resourceMap: options.resourceMap,
                $$base: token.getTemplateUrl(),
                $$root: token.getRootTemplateUrl(),
                $$page: options.pageUrl,
                $$configRoot: options.configRoot
            }
        )
        return value == null ? '' : escapeHtml(value)
    },
    Helper (options, token, context, template) {
        const helper = options.helpers[token.name]
        if (!helper) {
            throw new Exception(`Miss helper#${token.name}`, token.loc.start, template || '')
        }
        let data = token.params.context
        if (data) {
            data = data.type === 'name' ? context.lookup(data.value) : data.value
        }
        const value = helper.call(
            context,
            data,
            {
                fn: createRenderer(token.block, context, template, options),
                inverse: token.inverse
                    ? createRenderer(token.inverse, context, template, options)
                    : function () { return '' },
                hash: transformHash(token.params.hash, context),
                $$base: token.getTemplateUrl(),
                $$root: token.getRootTemplateUrl(),
                $$page: options.pageUrl,
                $$configRoot: options.configRoot
            }
        )
        return value == null ? '' : escapeHtml(value)
    },
    Partial (options, token, context, template) {
        const partial = token.name.type === 'name'
            ? context.lookup(token.name.value)
            : token.name.value
        let value = partial && options.partials[partial]
        if (value == null) {
            throw new Exception(`Miss partial#${partial || token.name.value}`,
                token.loc.start, template || '')
        }
        let data = token.params.context
        if (data) {
            data = data.type === 'name' ? context.lookup(data.value) : data.value
        }
        return renderAst(
            options.parse(value, partial),
            token.params.context ? context.push(data) : context,
            value,
            options
        )
    }
}

function renderAst (ast, context, template, options) {
    let buffer = ''
    const tokens = isArray(ast) ? ast : ast.body
    for (let i = 0, len = tokens.length; i < len; i++) {
        let token = tokens[i]
        let value = renderer[token.type](options, token, context, template)
        if (value) {
            buffer += value
        }
    }
    return buffer
}

function createRenderer (tokens, context, template, options) {
    return (subContext, pluginData) => {
        if (!(subContext instanceof Context)) {
            subContext = subContext === context.data
                ? context
                : context.push(subContext, pluginData)
        }
        return renderAst(tokens, subContext, template, options)
    }
}

exports = module.exports = renderAst
