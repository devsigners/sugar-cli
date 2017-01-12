const Token = require('sugar-template/lib/token')

function extendToken () {
    Token.prototype.getTemplateUrl = function() {
        if (this.type === 'Program') {
            return this.templateUrl
        } else if (this.parent) {
            return this.parent.getTemplateUrl()
        }
        return ''
    }

    Token.prototype.getRootTemplateUrl = function() {
        let parent = this
        while (parent.parent) {
            parent = parent.parent
        }
        return this.templateUrl
    }

    Token.prototype.shallowClone = function() {
        return Object.assign({}, this)
    }
}

module.exports = function prepare () {
    extendToken()
}
