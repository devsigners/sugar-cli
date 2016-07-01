const {
    extname,
    join,
    sep
} = require('path')
const debug = require('debug')('sugar-template')
const {
    statSync,
    merge,
    tryAndLoadConfig
} = require('../../utils')
const defaultWriter = require('./sugar-server')

const getProjectDir = (url, isProjectGroup) => {
    const parts = url.slice(1).split('/')
    let projectDir
    if (isProjectGroup(parts[0])) {
        projectDir = parts.slice(0, 2).join(sep)
    } else {
        projectDir = parts[0]
    }
    return projectDir
}
const createRenderer = (instance, options) => {
    return function(ctx, url, locals) {
        debug('[prepare] Enter sugar-template rendering, url: %s', url)

        locals = locals || {}
        merge(locals, ctx.state, instance.locals)

        // check component
        let isComponent = false
        if (url.startsWith('/components/')) {
            url = url.slice(11)
            isComponent = true
        }
        // fetch config
        let projectDir = getProjectDir(url, options.isProjectGroup)
        let configFileUrl = join(options.root, projectDir, options.configFilename)

        debug('[prepare] Resolved project dir: %s, configFileUrl: %s', projectDir, configFileUrl)

        let configPromise = tryAndLoadConfig(configFileUrl, ['.yml', '.yaml', '.json', '.js'])
        if (!configPromise) {
            debug('[prepare] Find no project config file.')
            configPromise = Promise.resolve({})
        }

        let fileUrl
        if (isComponent) {
            fileUrl = join(options.root, projectDir, '__component_viewer__.ext')
            debug('[prepare] Attempt to render component,\n\turl %o\n\tfileUrl', url, fileUrl)
            instance.registerPartial(fileUrl, `
                ---
                layout: false
                ---
                {{> ${url.slice(projectDir.length + 2)} }}
            `)
        } else {
            fileUrl = join(options.root, url, extname(url) ? '' : 'index.html')
        }

        return configPromise.then(config => {
            debug('[prepare] Resolved local config is %o', config)
            return instance.renderTemplate(fileUrl, projectDir, locals, config, options)
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

exports = module.exports = function middleware(options) {
    debug('[middleware] Init sugar-template middleware, options is %o', options)
    const render = createRenderer(defaultWriter, options)
    return function renderView(ctx, next) {
        if (!validate(ctx, options.templateExt)) return next()

        return render(ctx, ctx.path).then((html) => {
            ctx.body = html
            debug('[middleware] Finally attach generated html to response body.')
            return next()
        }).catch(error => {
            console.error(error)
        })
    }
}
