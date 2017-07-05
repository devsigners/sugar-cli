const { extname, join } = require('path')
const { merge, getDirectoryFromUrl } = require('../helper/utils')
const Sugar = require('./core')
const defaultConfig = require('../helper/config').template
const logger = require('../helper/logger')
const renderCore = new Sugar()

const createRenderer = (renderer, config) => {
    return function (ctx, locals) {
        if (!locals) locals = {}
        merge(locals, ctx.state, renderer.locals)

        logger.info(`sugar render process start`, 'middleware')
        // fetch config
        let url = ctx.path
        if (!extname(url)) {
            url = join(url, config.defaultPage + config.templateExt)
        }
        const fileUrl = join(config.root, url)
        const projectDir = getDirectoryFromUrl(url, config.groups)
        const configFileUrl = join(config.root, projectDir, config.configFilename)

        logger.log(`\n\turl: %s,\n\tproject: %s,\n\tconfig file: %s`, 'middleware', url, projectDir, configFileUrl)
        return renderer.fetchData(configFileUrl).then(localConfig => {
            logger.log(`local config: %j`, 'middleware', localConfig)
            return renderer.render(fileUrl, {
                directory: projectDir,
                data: locals,
                config: merge({}, config, localConfig)
            })
        })
    }
}

const isRequestHtml = ctx => ctx.accepts('html')
const validate = (ctx, templateExt) => {
    if (ctx.method !== 'HEAD' && ctx.method !== 'GET') return false
    if (ctx.body != null || ctx.status !== 404 || !isRequestHtml(ctx)) return false
    const ext = extname(ctx.path)
    if (ext && ext !== templateExt) return false
    return true
}

exports = module.exports = function middleware (options, setting) {
    logger.info(`setup sugar middleware, options is %j, setting is %j`, 'middleware', options, setting)
    // apply special setting to renderCore
    if (setting) {
        renderCore._set(setting)
    }
    options = merge({}, defaultConfig, options)

    const render = createRenderer(renderCore, options)
    return function renderView (ctx, next) {
        if (!validate(ctx, options.templateExt)) return next()

        return render(ctx).then(html => {
            ctx.body = html
            logger.info(`sugar render process finished`, 'middleware')
            logger.log()
            return next()
        }).catch(err => {
            logger.error(`error occured while rendering, detail is %j`, 'middleware', err)
            logger.log()
        })
    }
}

exports.createRenderer = createRenderer
