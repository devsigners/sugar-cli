const EventEmitter = require('events')
const {
    join,
    isAbsolute,
    extname
} = require('path')
const fetch = require('node-fetch')
const LRUCache = require('../helper/lru')
const injectCoreHelpers = require('./core-helpers')
const injectCorePlugins = require('./core-plugins')
const Token = require('sugar-template/lib/token')
const Context = require('sugar-template/lib/context')

const {
    tokenizer,
    parser,
    traverser
} = require('sugar-template/lib/compiler')
const {
    isFunction
} = require('sugar-template/lib/utils')
const {
    read
} = require('../helper/fs')
const {
    tryAndLoadData,
    parseMixedYaml,
    merge,
    getDirectoryFromUrl,
    isHttpUrl
} = require('../helper/utils')
const renderAst = require('./renderer')
const logger = require('../helper/logger')


const defaultDataFileExts = ['.yml', '.yaml', '.json', '.js']
const FLAG_SHARED_RE = /^\s*shared?:\s*/i
const FLAG_LOCALE_RE = /^\s*locale?:\s*/i

Token.prototype.getTemplateUrl = function() {
    if (this.type === 'Program') {
        return this.templateUrl
    } else if (this.parent) {
        return this.parent.getTemplateUrl()
    }
    return ''
}

Token.prototype.getRootTemplateUrl = function() {
    let parent = this
    while (parent.parent) {
        parent = parent.parent
    }
    return this.templateUrl
}

Token.prototype.shallowClone = function() {
    return Object.assign({}, this)
}

class Sugar extends EventEmitter {
    constructor() {
        super()
        this.setting = {}                 // global render setting
        this.plugins = {}                 // plugins
        this.helpers = {}                 // url --> helper fn
        this.filters = {}                 // url --> filter fn
        this.partials = new LRUCache(64)  // url --> template
        this.cache = new LRUCache(64)     // template --> tokens
        this.data = new LRUCache(64)      // url --> data

        // prepare work
        injectCoreHelpers(this)
        injectCorePlugins(this)
        // inner partials, should alwyas in cache
        this.__inner_partils__ = {
            '__plain_layout__.ext': '{{{body}}}'
        }
    }
    parse(template, templateUrl) {
        logger.log(`%s`, `parse`, template && template.slice(0, 20) + '...')
        const cache = this.cache
        let ast = cache.get(template)
        let parsed
        if (ast == null) {
            parsed = parseMixedYaml(template)
            ast = parser(tokenizer(parsed.content))
            // attach metadata
            ast.metadata = parsed.metadata
            cache.add(template, ast)
        }
        if (templateUrl) {
            // NOTE:
            // Corner case: File with different url has same content,
            // shallow clone ast to prevent template url being overwriten!
            if (ast.templateUrl) {
                ast = ast.shallowClone()
            }
            if (typeof templateUrl === 'object') {
                throw new Error('invalid')
            }
            ast.templateUrl = templateUrl
        }
        this.emit('compile', ast)
        return ast
    }
    fetchTemplate(url) {
        logger.log(`%s`, `fetchTemplate`, url)
        let disableCache = this.setting.disableCache
        let tpl
        // url likes __xxx__.ext should always use cache
        if (/__\S+__\.ext$/.test(url)) {
            disableCache = false
            tpl = this.__inner_partils__[url]
        } else {
            tpl = this.partials.get(url)
            if (tpl == null || disableCache) {
                return read(url).then(content => {
                    this.registerPartial(url, content)
                    return content
                })
            }
        }
        return Promise.resolve(tpl)
    }
    fetchData(url, exts = defaultDataFileExts) {
        logger.log(`%s`, `fetchData`, url)
        let data
        if (typeof exts === 'string') {
            // Let fetchData support http(s) url
            if (isHttpUrl(url)) {
                return fetch(url).then(res => {
                    data = res.json()
                    this.data.set(url, data)
                    return data
                })
            }
            if (extname(url) === exts) {
                url = url.slice(0, -exts.length)
            }
            exts = [exts]
        }
        if (!this.setting.disableCache) {
            const cached = exts.some(ext => {
                data = this.data.get(url + ext)
                if (data) return true
            })
            if (cached) return Promise.resolve(data)
        }
        const back = {}
        return tryAndLoadData(url, exts, false, back).then(data => {
            this.data.set(url + back.ext, data)
            return data
        })
    }
    render(url, { data, config, directory }) {
        // As we know, this.partials is lru cache. So it's possible to lose
        // a partial even you get it just now inside one page render process.
        // So every page has its own partial cache.
        const PartialCache = {}
        const instance = this
        if (!data) data = {}
        if (!directory) {
            directory = getDirectoryFromUrl(
                url.slice(config.root.length),
                config.groupPattern
            )
        }
        if ('disableCache' in config) {
            this.setting.disableCache = !!config.disableCache
        }
        const context = new Context(data)
        this.emit('pre-render', { url, config, directory, context })
        return this.fetchTemplate(url)
            .then(template => {
                const ast = this.parse(template, url)
                let layout, isFakeLayoutUrl, dataPromise
                if (ast.metadata) {
                    // NOTE:
                    // Data from yaml head has lower priority,
                    // means data here can be overwriten by dataFile.
                    merge(data, ast.metadata)
                    const dataFile = ast.metadata.data
                    if (dataFile) {
                        dataPromise = this.fetchData(
                            fixUrl(dataFile, 'data'),
                            extname(dataFile) || defaultDataFileExts
                        ).then(d => merge(data, d))
                    }
                    layout = ast.metadata.layout
                }
                // Check if template startsWith '<!DOCTYPE', if is, set layout to false
                if (/^\s*<!doctype\s+/i.test(template)) {
                    layout = false
                }

                // NOTE:
                // 1. no layout offered, 2. layout = false (shut down)
                if (!layout) {
                    layout = '__plain_layout__.ext' // '{{{body}}}'
                    isFakeLayoutUrl = true
                }
                // use default layout
                else if (layout === true) {
                    layout = 'locale:' + config.defaultLayout
                }

                if (!isFakeLayoutUrl) {
                    layout = fixUrl(layout, 'layout')
                }
                if (!extname(layout)) {
                    layout += config.templateExt
                }
                return this.fetchTemplate(layout).then(tpl => {
                    return dataPromise ? dataPromise.then(() => tpl) : tpl
                }).then(tpl => {
                    return [this.parse(tpl, layout), tpl, ast, template]
                })
            })
            .then(([layoutAst, layoutTpl, pageAst, pageTpl]) => {

                const promises = [
                    collectAndResolveDependencies(pageAst),
                    collectAndResolveDependencies(layoutAst)
                ]
                // const pagePromise = collectAndResolveDependencies(pageAst)
                // const layoutPromise = collectAndResolveDependencies(layoutAst)

                // A chance to alter promises
                this.emit('pre-dependencies', promises)
                return Promise.all(promises).then(() => {
                    const renderOpts = {
                        helpers: this.helpers,
                        filters: this.filters,
                        partials: PartialCache,
                        parse: this.parse.bind(this),
                        pageUrl: url,
                        configRoot: config.root,
                        resourceMap: {
                            css: [],
                            js: [],
                            img: []
                        }
                    }
                    // After dependencies resolved, there is a chance
                    // to modify partials/helpers/filters directly
                    this.emit('post-dependencies', renderOpts)

                    const body = renderAst(pageAst, context, pageTpl, renderOpts)
                    const res = {
                        url,
                        html: renderAst(layoutAst, context.push(
                            // enable layout metadata, but no dataFile
                            merge({ body }, layoutAst.metadata)
                        ), layoutTpl, renderOpts),
                        resourceMap: renderOpts.resourceMap,
                        directory,
                        config
                    }
                    this.emit('post-render', res)
                    // We can modify html sync, or add a promise to res.
                    return res.promise || res.html
                })
            })

        // raw should always be string
        function fixUrl(raw, type) {
            let root, rawUrl
            // helpers/partials/data/layout
            let typeDir
            if (typeof raw === 'object') {
                // Always treat value as string (wont break down)
                rawUrl = raw.name.value
                root = join(raw.getTemplateUrl(), '..')
            } else {
                rawUrl = raw
            }

            if (isHttpUrl(rawUrl) || isAbsolute(rawUrl)) {
                return rawUrl
            }

            if (FLAG_SHARED_RE.test(rawUrl)) {
                rawUrl = rawUrl.replace(FLAG_SHARED_RE, '')
                root = join(config.root, config.shared)
                typeDir = config[type] || ''
            } else if (FLAG_LOCALE_RE.test(rawUrl)) {
                rawUrl = rawUrl.replace(FLAG_LOCALE_RE, '')
                root = join(config.root, directory)
                typeDir = config[type] || ''
            } else {
                // for relative url, ignore type directory
                typeDir = ''
            }

            return join(root || join(url, '..'), typeDir, rawUrl)
        }

        function collectAndResolveDependencies(ast) {
            logger.log(``, `collectAndResolveDependencies`)
            const innerTasks = []
            traverser(ast, {
                Partial(token) {
                    let promise = resolvePartial(token)
                    if (promise) {
                        innerTasks.push(promise.then(partialUrl => {
                            return collectAndResolveDependencies(instance.parse(PartialCache[partialUrl], partialUrl))
                        }))
                    }
                }
            })
            return Promise.all(innerTasks)

            function resolvePartial(token) {
                let partialUrl = fixUrl(token, 'partial')
                if (!extname(partialUrl)) {
                    partialUrl += config.templateExt
                }
                // adjust partial token's value to filepath
                token.name.value = partialUrl
                // For compatible reason, always treat name.value as string
                token.name.type = 'primitive'

                if (PartialCache[partialUrl] != null) return

                const content = instance.partials.get(partialUrl)
                // Use get, so we can ensure cache won't be deleted
                if (content != null) {
                    // cache it to prevent deleted of this.partials
                    PartialCache[partialUrl] = content
                } else {
                    return instance.fetchTemplate(partialUrl)
                        .then(tpl => {
                            PartialCache[partialUrl] = tpl
                            return partialUrl
                        })
                }
            }
        }
    }
    // add helper function
    registerHelper(name, fn) {
        if (!name) return
        if (!isFunction(fn)) {
            throw new Error('Helper should be a function')
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
            throw new Error('Filter should be a function')
        }
        this.filters[name] = fn
    }
    unregisterFilter(name) {
        delete this.filters[name]
    }
    // add partials
    registerPartial(name, template) {
        if (!name || typeof template !== 'string') return
        this.partials.set(name, template)
    }
    unregisterPartial(name) {
        delete this.partials[name]
    }
    registerPlugin(name, plugin) {
        this.plugins[name] = plugin
        return plugin(this)
    }
}

exports = module.exports = Sugar
