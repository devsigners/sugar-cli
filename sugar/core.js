const EventEmitter = require('events')
const { join, isAbsolute, extname } = require('path')
const fetch = require('node-fetch')
const LRUCache = require('../helper/lru')
const injectCoreHelpers = require('./core-helpers')
const injectCorePlugins = require('./core-plugins')
const Context = require('sugar-template/lib/context')

const { tokenizer, parser, traverser } = require('sugar-template/lib/compiler')
const { isFunction } = require('sugar-template/lib/utils')
const { read } = require('../helper/fs')
const {
    tryAndLoadData,
    parseMixedYaml,
    merge,
    getDirectoryFromUrl,
    isHttpUrl
} = require('../helper/utils')
const renderAst = require('./renderer')
const logger = require('../helper/logger')
require('./core-init')()

const defaultDataFileExts = ['.yml', '.yaml', '.json', '.js']
const FLAG_SHARED_RE = /^\s*(shared?|common):\s*/i
const FLAG_LOCALE_RE = /^\s*locale?:\s*/i

class Sugar extends EventEmitter {
    constructor () {
        super()
        this.plugins = {}                 // plugins
        this.helpers = {}                 // url --> helper fn
        this.filters = {}                 // url --> filter fn
        this.partials = new LRUCache(64)  // url --> template
        this.cache = new LRUCache(64)     // template --> tokens
        this.data = new LRUCache(64)      // url --> data
        // global render setting
        Object.defineProperty(this, 'setting', {
            value: {},
            writable: false,
            enumerable: true,
            configurable: false
        })
        // prepare work
        injectCoreHelpers(this)
        injectCorePlugins(this)
        // inner partials, should alwyas in cache
        this.__inner_partils__ = {
            '__plain_layout__.ext': '{{{body}}}'
        }
        this.__inner_helpers__ = new Set(
            Object.keys(this.helpers).concat(Object.keys(this.filters))
        )
    }
    _set(prop, value) {
        if (typeof prop === 'object') {
            merge(this.setting, prop)
        } else if (typeof prop === 'string') {
            this.setting[prop] = value
        } else {
            return
        }
        this.emit('setting-change', this.setting)
    }
    parse (template, templateUrl) {
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
    fetchTemplate (url) {
        let disableCache = this.setting.disableCache
        let tpl
        logger.log(`disableCache: %j, url: %s`, `fetchTemplate`, disableCache, url)
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
    fetchData (url, exts = defaultDataFileExts) {
        logger.log(`disableCache: %j, url: %s`, `fetchData`, this.setting.disableCache, url)
        let data
        if (typeof exts === 'string') {
            // Let fetchData support http(s) url
            if (isHttpUrl(url)) {
                return fetch(url).then(res => res.json()).then(data => {
                    logger.log('remote data fetched: %j', 'fetchData', data)
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
    render (url, { data, config, directory }) {
        // As we know, this.partials is lru cache. So it's possible to lose
        // a partial even you get it just now inside one page render process.
        // So every page has its own partial cache.
        const PartialCache = {}
        const instance = this
        if (!data) data = {}
        if (!directory) {
            directory = getDirectoryFromUrl(
                url.slice(config.root.length),
                config.groups
            )
        }
        if ('disableCache' in config) {
            this._set('disableCache', !!config.disableCache)
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
            }).then(([layoutAst, layoutTpl, pageAst, pageTpl]) => {
                const promises = [
                    collectAndResolveDependencies(pageAst),
                    collectAndResolveDependencies(layoutAst)
                ]

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
        function fixUrl (raw, type) {
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

        function collectAndResolveDependencies (ast) {
            logger.log(`AST type: ${ast.type}`, `collectAndResolveDependencies`)
            const innerTasks = []
            traverser(ast, {
                Partial (token) {
                    let promise = resolvePartial(token)
                    if (promise) {
                        innerTasks.push(promise.then(partialUrl => {
                            return collectAndResolveDependencies(instance.parse(PartialCache[partialUrl], partialUrl))
                        }))
                    }
                },
                Helper (token) {
                    resolveHelper(token, 'Helper')
                },
                InlineHelper (token) {
                    resolveHelper(token, 'InlineHelper')
                },
                Filter (token) {
                    resolveFilter(token, 'Filter')
                }
            })
            return Promise.all(innerTasks)

            function resolveFilter (token, type) {
                const filters = token.filters
                filters.forEach(filter => {
                    resolveHelper(filter, type)
                })
            }

            function resolveHelper (token, type) {
                const name = token.name
                logger.log(`%s`, `resolveHelper`, name)
                // Ignore built-in helpers/filters.
                if (instance.__inner_helpers__.has(name)) {
                    return
                }
                let tokenUrl = fixUrl(name, 'helper')
                let fn

                if (!extname(tokenUrl)) {
                    tokenUrl += '.js'
                }
                // If helper/filters registered, udpate name and return
                if (instance[type === 'Filter' ? 'filters' : 'helpers'][tokenUrl]) {
                    token.name = tokenUrl
                    return
                }
                try {
                    fn = require(tokenUrl)
                } catch (e) {
                    logger.error(`failed to fetch helper: %s`, 'resolveHelper', tokenUrl)
                }
                if (fn) {
                    // NOTE:
                    // If helper/filters is not built-in, the name is url.
                    instance[type === 'Filter' ? 'registerFilter' : 'registerHelper'](tokenUrl, fn)
                    token.name = tokenUrl
                }
            }

            function resolvePartial (token) {
                let partialUrl = fixUrl(token, 'partial')
                if (!extname(partialUrl)) {
                    partialUrl += config.templateExt
                }
                // adjust partial token's value to filepath
                token.name.value = partialUrl
                // For compatible reason, always treat name.value as string
                token.name.type = 'primitive'
                logger.log(`token: %j`, `resolvePartial`, token.name)
                if (PartialCache[partialUrl] != null) {
                    logger.info('will use cache: %s...', 'resolvePartial', PartialCache[partialUrl].slice(0, 20))
                    return
                }

                // Use get, so we can ensure cache won't be deleted
                const content = instance.partials.get(partialUrl)

                // If disableCache is true, always re-fetch.
                if (content == null || instance.setting.disableCache) {
                    return instance.fetchTemplate(partialUrl)
                        .then(tpl => {
                            PartialCache[partialUrl] = tpl
                            return partialUrl
                        })
                }

                // cache it to prevent deleted of this.partials
                PartialCache[partialUrl] = content
            }
        }
    }
    // add helper function
    registerHelper (name, fn) {
        if (!name) return
        if (!isFunction(fn)) {
            throw new Error('Helper should be a function')
        }
        this.helpers[name] = fn
    }
    unregisterHelper (name) {
        delete this.helpers[name]
    }
    // add filter function
    registerFilter (name, fn) {
        if (!name) return
        if (!isFunction(fn)) {
            throw new Error('Filter should be a function')
        }
        this.filters[name] = fn
    }
    unregisterFilter (name) {
        delete this.filters[name]
    }
    // add partials
    registerPartial (name, template) {
        if (!name || typeof template !== 'string') return
        this.partials.set(name, template)
    }
    unregisterPartial (name) {
        delete this.partials[name]
    }
    registerPlugin (name, plugin) {
        // The return value of plugin() should be function,
        // and invoke it will unregister this plugin
        if (!isFunction(plugin)) {
            throw new Error('Plugin should be a function')
        }
        this.plugins[name] = plugin(this)
    }
    unregisterPlugin (name) {
        if (name && this.plugins[name]) {
            this.plugins[name](this)
        }
    }
}

exports = module.exports = Sugar
