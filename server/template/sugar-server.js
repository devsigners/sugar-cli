const ServerWriter = require('./writer')
const {
    typeStr,
    escapeHtml,
    SafeString
} = require('sugar-template/src/utils')

const defaultWriter = new ServerWriter()

// register built-in helpers
require('sugar-template/src/helpers/if')(defaultWriter)
require('sugar-template/src/helpers/each')(defaultWriter)
require('./builtinFn')(defaultWriter)
// register built-in filters
require('sugar-template/src/filters/stringTransform')(defaultWriter)


ServerWriter.SafeString = SafeString
ServerWriter.escape = escapeHtml

module.exports = defaultWriter
