const colors = require('colors/safe')
const { Logger } = require('../helper/logger')

const logger = new Logger({
    showTime: false,
    alwaysCheckLevel: false,
    level: 0,
    theme: {
        log: 'gray'
    }
})

// custom logger
logger._log = function _log (message, indent = true, level = 'log') {
    // Check if we should output
    const levelNum = this.levels[level]
    if (levelNum < this.level) return

    if (this.alwaysCheckLevel) {
        const _level = +process.env.LOGLEVEL || 0
        if (levelNum < _level) return
    }

    if (typeof message !== 'string') {
        return console.log()
    }
    console[level](
        (indent ? '  ' : '') + colors[level](message)
    )
}

logger.zLog = function zLog (message, indent = true, level, bold) {
    message = colors[level](message)
    console[level](
        (indent ? '  ' : '') + (bold ? colors.bold(message) : message)
    )
}

module.exports = logger
