const {
    isAbsolute,
    extname,
    join,
    sep
} = require('path')
const debug = require('debug')('sugar-template')
const Context = require('sugar-template/lib/context')
const Writer = require('sugar-template/lib/writer').Writer
const parseTemplate = require('sugar-template/lib/parser')
const {
    read,
    statSync,
    parseMixedYaml,
    merge,
    loadConfig,
    tryAndLoadConfig
} = require('../../utils')
const {
    isFunction,
    isRawValue,
    escapeHtml,
    getValueFromString
} = require('sugar-template/lib/utils')

function checkUrl(token) {
    if (token.url) return token.url
    token = token.parent
    return token ? checkUrl(token) : null
}
function getRootToken(token) {
    return !token.parent ? token : getRootToken(token.parent)
}

class ServerWriter extends Writer {
    constructor(setting) {
        super()
        this.cache = {}
        this.helpers = {}
        this.filters = {}
        this.partials = {}
        this.registerPartial('__plain_layout__.ext', '{{{body}}}')
        // writer config, control writer render behavior
        this.__setting__ = setting || {}
    }
    installHelper(name, fileUrl) {
        debug('[installHelper] name: %o, url: %o', name, fileUrl)
        const defer = Promise.defer()
        if (statSync(fileUrl)) {
            this.registerHelper(name, require(fileUrl))
            defer.resolve()
        } else {
            defer.reject(`Helper file of [${fileUrl}] not exist!`)
        }
        return defer.promise
    }
    installPartial(fileUrl) {
        debug('[installPartial] url: %o', fileUrl)
        return this.fetchTemplate(fileUrl)
    }
    parse(template, tags, parentToken, templateUrl) {
        const cache = this.cache
        let tokens = cache[template]
        let parsed
        if (tokens == null) {
            parsed = parseMixedYaml(template)
            tokens = cache[template] = parseTemplate(parsed.content, tags, parentToken)
        }
        // save the url for path resolve usage
        tokens.forEach(token => (token.url = templateUrl))

        // attach config read from yaml head
        if (parsed && parsed.metadata) {
            tokens.metadata = parsed.metadata
        }

        debug(`[parse] url: %o, metadata: %o`, templateUrl, tokens.metadata)
        return tokens
    }
    fetchTemplate(url) {
        debug(`[fetchTemplate] url: %o`, url)
        const layout = this.partials[url]
        if (layout == null) {
            return read(url).then(content => {
                this.registerPartial(url, content)
                return content
            })
        }
        return Promise.resolve(layout)
    }
    renderTemplate(url, projectDir, data, localConfig, baseConfig) {
        data = data || {}
        const self = this
        debug(`[render] Enter renderTemplate:\n\turl is %o\n\tprojectDir is %o`, url, projectDir)
        return this.fetchTemplate(url).then(template => {
            const tokens = this.parse(template, undefined, undefined, url)
            const promises = []
            let layout, isFakeLayoutUrl
            if (tokens.metadata) {
                merge(data, tokens.metadata)
                let dataFile = tokens.metadata.data
                if (dataFile) {
                    dataFile = retrieveUrl('data', { value: dataFile })
                    const ext = extname(dataFile)
                    debug('[fetchData] About to read data file %o, ext %o', dataFile, ext)
                    promises.push(
                        (ext ? loadConfig(dataFile, ext) : tryAndLoadConfig(dataFile, ['.yml', '.yaml', '.json', '.js']))
                            .then(d => merge(data, d))
                    )
                }
                layout = tokens.metadata.layout
            }
            // Check if template startsWith '<!DOCTYPE', if is, set layout to false
            if (/^\s*<!doctype\s+/i.test(template)) {
                layout = false
            }

            if (layout == null) {
                layout = join(
                    baseConfig.root,
                    projectDir,
                    localConfig.layout == null ? baseConfig.layout : localConfig.layout,
                    localConfig.defaultLayout || baseConfig.defaultLayout
                )
            } else if (!layout) {
                layout = '__plain_layout__.ext'// '{{{body}}}'
                isFakeLayoutUrl = true
            } else if (layout.startsWith('locale:')) {
                layout = join(
                    baseConfig.root,
                    projectDir,
                    localConfig.layout == null ? baseConfig.layout : localConfig.layout,
                    layout.slice(7)
                )
            } else if (layout.startsWith('shared:')) {
                layout = join(baseConfig.root, baseConfig.shared, baseConfig.layout, layout.slice(7))
            } else if (isAbsolute(layout)) {
                // do nothing now, maybe resolved to baseConfig.root later?
            } else {
                layout = join(url, '..', layout)
            }
            if (!extname(layout)) {
                layout += baseConfig.templateExt
            }
            promises.unshift(this.fetchTemplate(layout))
            collectAndResolveDependencies(tokens, promises)
            return Promise.all(promises).then(([layoutContent]) => {
                debug('[render] Body dependencies are resolved, and layout is loaded.')
                return [layoutContent, layout, isFakeLayoutUrl, template, tokens]
            })
        })
        .then(([layout, layoutUrl, isFakeLayoutUrl, template, tokens]) => {
            const ctx = new Context(data)
            const body = this.renderTokens(tokens, ctx, template)
            // parse layout
            const layoutTokens = this.parse(layout, undefined, undefined, isFakeLayoutUrl ? null : layoutUrl)
            const promises = collectAndResolveDependencies(layoutTokens)
            return Promise.all(promises).then(() => {
                debug('[render] Layout dependencies are resolved, then render layout.')
                return this.renderTokens(layoutTokens, ctx.push(
                    // enable layout metadata, but no dataFile
                    merge({ body }, layoutTokens.metadata)
                ), layout)
            })
        })

        function collectAndResolveDependencies(tokens, promises) {
            if (!promises) promises = []
            debug('[collectAndResolveDependencies] tokens count: %o', tokens.length)
            visitTokenTree(tokens, token => {
                if (token.type === '#' || token.type === 'inlineHelper') {
                    promises.push(handleHelper(token))
                } else if (token.type === '>') {
                    promises.push(handlePartial(token))
                }
            })
            return promises
        }

        function handleHelper(token) {
            let helperUrl = retrieveUrl('helper', token)
            if (!extname(helperUrl)) {
                helperUrl += '.js'
            }
            const parts = helperUrl.split(sep)
            if (parts.length > 1) {
                token.value = token.helper = parts[parts.length - 1].slice(0, -3)
            }
            // attach page url and config.root
            token.addtionalInfo = {
                page: url,
                configRoot: baseConfig.root
            }
            debug('[handleHelper] helper: %o', token.value)
            if (self.helpers[token.value]) return

            return self.installHelper(token.value, helperUrl)
        }

        // Partial is not like helper/filter, we should avoid
        // overwrite partials with same name (in shared and locale).
        // Important: so we use absolute path as partials name!!!
        function handlePartial(token) {
            let partialUrl = retrieveUrl('partial', token)
            if (!extname(partialUrl)) {
                partialUrl += baseConfig.templateExt
            }
            token.value = token.partial = partialUrl
            debug('[handlePartial] url: %o', partialUrl)
            if (self.partials[partialUrl]) return
            return self.installPartial(partialUrl)
                .then(content => {
                    // recursively resolve dependencies for partial
                    const tokens = self.parse(content, undefined, token, partialUrl)
                    const promises = collectAndResolveDependencies(tokens)
                    const componentDataPromise = tryAndLoadConfig(
                        join(partialUrl, '../component'),
                        ['.yml', '.yaml', '.json', '.js']
                    )

                    if (componentDataPromise) {
                        promises.push(componentDataPromise.then(data => {
                            tokens.metadata = merge(data, tokens.metadata)
                        }))
                    }
                    return Promise.all(promises)
                })
        }

        function retrieveUrl(type, token) {
            let value = token.value
            let url
            if (value.startsWith('shared:')) {
                value = value.slice(7)
                url = join(baseConfig.root, baseConfig.shared, baseConfig[type], value)
            } else if (value.startsWith('locale:')) {
                value = value.slice(7)
                url = join(
                    baseConfig.root,
                    projectDir,
                    localConfig[type] == null ? baseConfig[type] : localConfig[type],
                    value
                )
            } else if (isAbsolute(value)) {
                url = value
            } else {
                let containerUrl = checkUrl(token)
                if (containerUrl == null) {
                    containerUrl = url
                }
                url = join(containerUrl, '..', value)
            }
            return url
        }
    }

    renderTokens(tokens, context, originalTemplate) {
        let buffer = ''

        let token, symbol, value
        for (let i = 0, numTokens = tokens.length; i < numTokens; ++i) {
            value = undefined
            token = tokens[i]
            symbol = token.type

            if (symbol === '#') {
                value = this.renderHelper(token, context, originalTemplate)
            } else if (symbol === '>') {
                value = this.renderPartial(token, context, originalTemplate)
            } else if (symbol === '&') {
                value = this.unescapedValue(token, context)
            } else if (symbol === 'filter') {
                value = this.renderFilter(token, context)
            } else if (symbol === 'inlineHelper') {
                value = this.renderInlineHelper(token, context)
            } else if (symbol === 'name') {
                value = this.escapedValue(token, context)
            } else if (symbol === 'text') {
                value = this.rawValue(token)
            }

            if (value !== undefined) {
                buffer += value
            }
        }

        return buffer
    }
    rawValue(token) {
        return token.value
    }
    escapedValue(token, context) {
        const value = context.lookup(token.value)
        if (value != null) return escapeHtml(value)
    }
    unescapedValue(token, context) {
        const value = context.lookup(token.value)
        if (value != null) return value
    }
    renderPartial(token, context, originalTemplate) {
        const value = this.partials[token.value]
        if (value != null) {
            // token.value is partial name and also partial url
            // In fact, the partial has been parsed when
            // collectAndResolveDependencies and we fetch cache this time
            const tokens = this.parse(value, undefined, token, token.value)
            let data = token.params.context
            let subContext
            if (data != null) {
                const isRaw = token.params.contextIsString || isRawValue(data)
                data = isRaw ? getValueFromString(data, isRaw.preferNumber) : context.lookup(data)
                // enable partial metadata, still not dataFile
                // Note: if data is simple value, we still merge,
                // and the data can be accessed via $$data
                if (isRaw) {
                    subContext = tokens.metadata
                        ? context.push(tokens.metadata, { data })
                        : context.push(data, { data })
                } else {
                    subContext = context.push(merge(data, tokens.metadata))
                }
            } else {
                subContext = tokens.metadata ? context.push(tokens.metadata) : context
            }
            debug('[renderPartial] partial: %o', token.value)
            return this.renderTokens(
                tokens,
                subContext,
                value
            )
        }
    }
    renderFilter(token, context) {
        const data = token.context && context.lookup(token.context)
        let value = data
        let filter
        token.filters.forEach((v) => {
            filter = this.filters[v.name]
            if (!filter) {
                throw new Error(`Miss filter#${v.name}, at ${token.loc.start}`)
            }
            value = filter(value, v.hash)
        })
        if (value != null) return escapeHtml(value)
    }
    renderInlineHelper(token, context) {
        const helper = this.helpers[token.value]
        if (!helper) {
            throw new Error(`Miss helper#${token.value}, at ${token.loc.start}`)
        }
        let data = token.params.context
        if (data != null) {
            const isRaw = token.params.contextIsString || isRawValue(data)
            data = isRaw ? getValueFromString(data, isRaw.preferNumber) : context.lookup(data)
        }
        const value = helper.call(
            context,
            data,
            {
                fn() { return '' },
                inverse() { return '' },
                hash: token.params.hash,
                $$base: checkUrl(token),
                $$root: getRootToken(token).url,
                // page url
                $$page: token.addtionalInfo && token.addtionalInfo.page,
                // config.root
                $$configRoot: token.addtionalInfo && token.addtionalInfo.configRoot
            }
        )
        if (value != null) return escapeHtml(value)
    }
    renderHelper(token, context, originalTemplate) {
        const helper = this.helpers[token.value]
        if (!helper) {
            throw new Error(`Miss helper#${token.value}, at ${token.loc.start}`)
        }
        let data = token.params.context
        if (data != null) {
            const isRaw = token.params.contextIsString || isRawValue(data)
            data = isRaw ? getValueFromString(data, isRaw.preferNumber) : context.lookup(data)
        }
        return helper.call(
            context,
            data,
            {
                fn: this._createRenderer(token.children, context, originalTemplate),
                inverse: token.inversedChildren
                    ? this._createRenderer(token.inversedChildren, context, originalTemplate)
                    : function() {
                        return ''
                    },
                hash: token.params.hash,
                $$base: checkUrl(token),
                $$root: getRootToken(token).url,
                $$page: token.addtionalInfo && token.addtionalInfo.page,
                $$configRoot: token.addtionalInfo && token.addtionalInfo.configRoot
            }
        )
    }
    _createRenderer(tokens, context, originalTemplate) {
        return (subContext, pluginData) => {
            if (!(subContext instanceof Context)) {
                subContext = subContext === context.data
                    ? context
                    : context.push(subContext, pluginData)
            }
            return this.renderTokens(tokens, subContext, originalTemplate)
        }
    }

    // add helper function
    registerHelper(name, fn) {
        if (!name) return
        if (!isFunction(fn)) {
            fn = function() {}
        }
        this.helpers[name] = fn
    }
    unregisterHelper(name) {
        delete this.helpers[name]
    }
    // add filter function
    registerFilter(name, fn) {
        if (!name) return
        if (!isFunction(fn)) {
            fn = () => fn
        }
        this.filters[name] = fn
    }
    unregisterFilter(name) {
        delete this.filters[name]
    }
    // add partials
    registerPartial(name, template) {
        if (!name || typeof template !== 'string') return
        this.partials[name] = template
    }
    unregisterPartial(name) {
        delete this.partials[name]
    }
}

function visitTokenTree(tokens, cb) {
    cb && tokens && tokens.forEach(token => {
        cb(token)
        visitTokenTree(token.children, cb)
        visitTokenTree(token.inversedChildren, cb)
    })
}

module.exports = ServerWriter
