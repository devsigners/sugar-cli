const static = require('koa-static')

module.exports = function(root, options) {
    return static(root, options)
}
