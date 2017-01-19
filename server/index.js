const Koa = require('koa')
const livereload = require('koa-livereload')
const koaLogger = require('koa-logger')
const logger = require('../helper/logger')
const Reloader = require('./livereload')

module.exports = runSugarServer

function runSugarServer (config = {}) {
    logger.info('start server, config is %j', 'server', config)
    const sugar = require('../sugar/koa-middleware')
    const serve = require('./static')
    const app = new Koa()

    if (config.server.verbose) {
        app.use(koaLogger())
    }
    app.use(sugar(config.template, config.extra))

    app.use(serve(config.template.root, {
        defer: true
    }))

    if (config.watch) {
        const port = config.watch.port
        app.use(livereload(port ? { port } : undefined))
        const instance = new Reloader({
            files: config.watch.files,
            port,
            chokidar: {
                cwd: config.template.root,
                ignoreInitial: true,
                followSymlinks: false
            }
        })
        // start livereload server
        instance.start()
    }

    app.listen(config.server.port, config.server.host, err => {
        if (err) {
            logger.zLog(`failed to run server`, true, 'error', true)
            logger.zLog(`error defail is ${err}`, true, 'error')
        } else {
            logger.zLog(`server is running at http://${config.server.host}:${config.server.port}`, true, 'info', true)
        }
    })
    return app
}
