const {
    extname,
    join,
    dirname,
    basename
} = require('path')
const debug = require('debug')('sugar')
const {
    tryAndLoadData,
    merge,
    getDirectoryFromUrl
} = require('../helper/utils')
const Sugar = require('./core')
const defaultConfig = require('./config')
const renderCore = new Sugar()

const createRenderer = (renderer, config) => {
    return function(ctx, locals) {
        if (!locals) locals = {}
        merge(locals, ctx.state, renderer.locals)

        // fetch config
        let url = ctx.path
        if (!extname(url)) {
            url = join(url, config.defaultPage + config.templateExt)
        }
        const fileUrl = join(config.root, url)
        const projectDir = getDirectoryFromUrl(url, config.groupPattern)
        const configFileUrl = join(config.root, projectDir, config.configFilename)

        debug('[middleware]\n\turl: %s \n\tproject: %s,\n\tconfig file: %s', url, projectDir, configFileUrl)

        return renderer.fetchData(configFileUrl).then(localConfig => {
            debug('[middleware] local config is %o', localConfig)
            return renderer.render(fileUrl, {
                directory: projectDir,
                data: locals,
                config: merge({}, config, localConfig)
            })
        })
    }
}

const isRequestHtml = (ctx) => {
    return ctx.accepts('html')
}
const validate = (ctx, templateExt) => {
    if (ctx.method !== 'HEAD' && ctx.method !== 'GET') return false
    if (ctx.body != null || ctx.status !== 404 || !isRequestHtml(ctx)) return false
    const ext = extname(ctx.path)
    if (ext && ext !== templateExt) return false
    return true
}

exports = module.exports = function middleware(options, setting) {
    debug('[middleware] Setup sugar-template middleware for koa, options is %o, setting is %o', options, setting)
    if (setting) {
        merge(renderCore.setting, setting) // apply setting to renderCore
    }
    options = merge({}, defaultConfig, options)

    const render = createRenderer(renderCore, options)
    return function renderView(ctx, next) {
        if (!validate(ctx, options.templateExt)) return next()

        return render(ctx).then((html) => {
            ctx.body = html
            debug('[middleware] Finally attach generated html to response body.')
            return next()
        }).catch(error => {
            console.error(error)
        })
    }
}

exports.createRenderer = createRenderer
