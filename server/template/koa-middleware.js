const {
    extname,
    join,
    sep
} = require('path')
const debug = require('debug')('sugar-template')
const {
    statSync,
    merge,
    loadConfig
} = require('../../utils')
const defaultWriter = require('./sugar-server')

const createRenderer = (instance, options) => {
    return function(ctx, url, locals) {
        debug('[prepare] Enter sugar-template rendering, url: %s', url)

        locals = locals || {}
        merge(locals, ctx.state, instance.locals)

        // fetch config
        const parts = url.slice(1).split('/')
        let projectDir
        if (options.isProjectGroup(parts[0])) {
            projectDir = parts.slice(0, 2).join(sep)
        } else {
            projectDir = parts[0]
        }
        let configFileUrl = join(options.root, projectDir, options.configFilename)

        debug('[prepare] Resolved project dir: %s, configFileUrl: %s', projectDir, configFileUrl)

        let configPromise
        if (statSync(configFileUrl + '.yml')) {
            configPromise = loadConfig(configFileUrl + '.yml', '.yml')
        } else if (statSync(configFileUrl + '.yaml')) {
            configPromise = loadConfig(configFileUrl + '.yaml', '.yaml')
        } else if (statSync(configFileUrl + '.json')) {
            configPromise = loadConfig(configFileUrl + '.json', '.json')
        } else if (statSync(configFileUrl + '.js')) {
            configPromise = loadConfig(configFileUrl + '.js', '.js')
        } else {
            debug('[prepare] Find no project config file.')
            configPromise = Promise.resolve({})
        }

        return configPromise.then(config => {
            debug('[prepare] Resolved local config is %o', config)

            return instance.renderTemplate(join(
                options.root, url, extname(url) ? '' : 'index.html'
            ), projectDir, locals, config, options)
        })
    }
}

const isRequestHtml = (ctx) => {
    return ctx.accepts('html')
}

module.exports = function middleware(options) {
    debug('[middleware] Init sugar-template middleware, options is %o', options)
    const render = createRenderer(defaultWriter, options)
    return function renderView(ctx, next) {
        if (ctx.method !== 'HEAD' && ctx.method !== 'GET') return next()
        if (ctx.body != null || ctx.status !== 404 || !isRequestHtml(ctx)) return next()
        const ext = extname(ctx.path)
        if (ext && ext !== options.templateExt) return next()

        return render(ctx, ctx.path).then((html) => {
            ctx.body = html
            debug('[middleware] Finally attach generated html to response body.')
            return next()
        }).catch(error => {
            console.error(error)
        })
    }
}