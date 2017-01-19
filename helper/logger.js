const colors = require('colors/safe')
const util = require('util')

class Logger {
    constructor ({ theme, level, title, showTime, boldPrefix, alwaysCheckLevel = true } = {}) {
        // theme
        this.theme = Object.assign({
            log: 'cyan',
            info: 'green',
            warn: 'yellow',
            error: 'red'
        }, theme)
        colors.setTheme(this.theme)
        // others
        this.levels = {
            log: 0,
            info: 1,
            warn: 2,
            error: 3
        }
        this.level = level || 0
        this.alwaysCheckLevel = alwaysCheckLevel
        this.title = title || 'Logger'
        this.showTime = typeof showTime === 'boolean' ? showTime : true
        this.boldPrefix = typeof boldPrefix === 'boolean' ? boldPrefix : true
    }
    _getTitle (title) {
        if (typeof title !== 'string') {
            title = this.title
        }
        return title ? `[${title}]` : ''
    }
    _getTime (date) {
        if (!this.showTime) {
            return ''
        }
        if (!(date instanceof Date)) {
            date = new Date()
        }
        return `[${this.formatTime(date)}]`
    }
    _getLevel (level = 'log') {
        return `[${level}]`.toUpperCase()
    }
    _log (message, title, level = 'log', indent = true) {
        // check if we should log
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
            (indent ? '  ' : '') + [
                this._getTime(),
                this._getLevel(level),
                this._getTitle(title)
            ].filter(v => !!v).map(v => colors[level](v)).map(v => {
                return this.boldPrefix ? colors.bold(v) : v
            }).concat(message).join(' ')
        )
    }
    static format (tpl, ...data) {
        let i = 0
        const len = data.length
        return tpl.replace(/%s|%d|%j/g, match => {
            if (i < len) {
                match = match === '%s'
                    ? String(data[i])
                    : match === '%d'
                    ? Number(data[i])
                    : data[i]
                match = util.inspect(match, { colors: true })
            }
            i++
            return match
        })
    }
    formatTime (date) {
        return [
            date.getUTCFullYear(),
            padding(date.getUTCMonth() + 1, 2),
            padding(date.getUTCDate(), 2)
        ].join('-') + ' ' + date.toTimeString().slice(0, 8)

        function padding (str, len, char = '0') {
            str = String(str)
            while (str.length < len) {
                str = char + str
            }
            return str
        }
    }
    log (message, title, ...data) {
        if (data.length) {
            message = Logger.format(message, ...data)
        }
        return this._log(message, title, 'log')
    }
    info (message, title, ...data) {
        if (data.length) {
            message = Logger.format(message, ...data)
        }
        return this._log(message, title, 'info')
    }
    warn (message, title, ...data) {
        if (data.length) {
            message = Logger.format(message, ...data)
        }
        return this._log(message, title, 'warn')
    }
    error (message, title, ...data) {
        if (data.length) {
            message = Logger.format(message, ...data)
        }
        return this._log(message, title, 'error')
    }
    // directly log, wont affected by log level.
    zLog (message, indent = true, level = 'log', bold) {
        message = colors[level](message)
        console[level](
            (indent ? '  ' : '') + (bold ? colors.bold(message) : message)
        )
    }
}

const defaultLogger = new Logger({
    showTime: false
})

exports = module.exports = defaultLogger
exports.Logger = Logger
