const Koa = require('koa')
const debug = require('debug')('sugar-server')

module.exports = function(config) {
    debug('[server] Init server, config is %o', config)
    const sugarTemplate = require('./template/koa-middleware')
    const serve = require('./static')
    const app = new Koa()
    app.use(sugarTemplate(config.template))

    app.use(serve(config.template.root, {
        defer: true
    }))

    app.listen(config.server.port, config.server.host, (err) => {
        if (err) {
            debug('[server] Failed to run server, error defail is %o', err)
        } else {
            debug(`[server] Server is running at http://${config.server.host}:${config.server.port}`)
        }
    })
    return app
}
