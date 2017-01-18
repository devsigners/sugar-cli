const Koa = require('koa')
const logger = require('koa-logger')
const serve = require('./index')

const app = new Koa()
app.use(logger())

module.exports = function (host, port, root, cb) {
    app.use(serve(root))
    app.listen(port, host, err => {
        cb && cb(err)
    })
    return app
}
