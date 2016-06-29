const ServerWriter = require('./writer')
const {
    typeStr,
    escapeHtml,
    SafeString
} = require('sugar-template/lib/utils')

const defaultWriter = new ServerWriter()

// register built-in helpers
require('sugar-template/lib/helpers/if')(defaultWriter)
require('sugar-template/lib/helpers/each')(defaultWriter)
require('./builtinFn')(defaultWriter)
// register built-in filters
require('sugar-template/lib/filters/stringTransform')(defaultWriter)


ServerWriter.SafeString = SafeString
ServerWriter.escape = escapeHtml

module.exports = defaultWriter
