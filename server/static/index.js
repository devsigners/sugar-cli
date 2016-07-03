const serve = require('koa-static')

module.exports = function(root, options) {
    return serve(root, options)
}
