const path = require('path')
const Koa = require('koa')
const config = require('../sugar.config')
const sugarTemplate = require('./template/koa-middleware')
const serve = require('./static')
const app = new Koa()

app.use(sugarTemplate(config.template))

app.use(serve(config.template.root, {
    defer: true
}))

app.listen(config.server.port, config.server.host, (err) => {
    console.log(err || `server run at http://${config.server.host}:${config.server.port}`)
})
