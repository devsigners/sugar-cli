const Koa = require('koa')
const livereload = require('koa-livereload')
const debug = require('debug')('sugar-server')
const Reloader = require('./livereload')

module.exports = function(config, setting) {
    debug('[server] Init server, config is %o', config)
    const sugarTemplate = require('./template/koa-middleware')
    const serve = require('./static')
    const app = new Koa()
    app.use(sugarTemplate(config.template, setting))

    app.use(serve(config.template.root, {
        defer: true
    }))

    if (config.watch) {
        app.use(livereload({
            port: config.watch.port
        }))
        // start livereload server
        const instance = new Reloader({
            files: config.watch.files,
            port: config.watch.port,
            watchOptions: {
                cwd: config.template.root
            }
        })
        instance.start()
    }

    app.listen(config.server.port, config.server.host, (err) => {
        if (err) {
            debug('[server] Failed to run server, error defail is %o', err)
        } else {
            debug(`[server] Server is running at http://${config.server.host}:${config.server.port}`)
        }
    })
    return app
}
