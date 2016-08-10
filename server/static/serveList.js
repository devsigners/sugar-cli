const {
    extname
} = require('path')
const serveList = require('koa-serve-list')

module.exports = function(root, options) {
    const render = serveList(root, options)
    return function serveList(ctx, next) {
        // only serve dir
        if (!extname(ctx.path)) {
            return render(ctx, next)
        }
        return next()
    }
}
