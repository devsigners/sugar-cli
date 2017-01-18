const Koa = require('koa')
const logger = require('../helper/logger')

module.exports = runSugarServer

function runSugarServer(config = {}) {
    logger.info('start server, config is %j', 'server', config)
    const sugar = require('../sugar/koa-middleware')
    const serve = require('./static')
    const app = new Koa()

    app.use(sugar(config.template, config.extra))

    app.use(serve(config.template.root, {
        defer: true
    }))

    app.listen(config.server.port, config.server.host, (err) => {
        if (err) {
            logger.zLog(`failed to run server`, true, 'error', true)
            logger.zLog(`error defail is ${err}`, true, 'error')
        } else {
            logger.zLog(`server is running at http://${config.server.host}:${config.server.port}`,  true, 'info', true)
        }
    })
    return app
}
