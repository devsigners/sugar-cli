const {
    isFunction,
    isEmpty,
    isArray,
    SafeString
} = require('sugar-template/lib/utils')
const { resolveUrl } = require('./core-plugins')

function injectCoreHelpers (instance) {
    instance.registerHelper('if', function (conditional, options) {
        if (isFunction(conditional)) {
            conditional = conditional.call(this)
        }

        let ret
        if ((!options.hash.includeZero && !conditional) || isEmpty(conditional)) {
            ret = options.inverse(this)
        } else {
            ret = options.fn(this)
        }
        return new SafeString(ret)
    })

    instance.registerHelper('unless', function (conditional, options) {
        return instance.helpers['if'].call(this, conditional, {
            fn: options.inverse,
            inverse: options.fn,
            hash: options.hash
        })
    })

    instance.registerHelper('each', function (context, options) {
        if (!options) {
            throw new Error('Must pass iterator to #each')
        }

        const fn = options.fn
        const inverse = options.inverse
        const hash = options.hash
        let i = hash.start || 0
        let ret = ''

        function execIteration (field, index, last) {
            ret += fn(context[field], {
                key: field,
                index: index,
                first: index === 0,
                last: !!last
            })
        }

        if (context && typeof context === 'object') {
            if (isArray(context)) {
                for (const j = context.length; i < j; i++) {
                    if (i in context) {
                        execIteration(i, i, i === j - 1)
                    }
                }
            } else {
                let priorKey

                for (const key in context) {
                    if (context.hasOwnProperty(key)) {
                        // We're running the iterations one step out of sync so we can detect
                        // the last iteration without have to scan the object twice and create
                        // an itermediate keys array.
                        if (priorKey !== undefined) {
                            execIteration(priorKey, i - 1)
                        }
                        priorKey = key
                        i++
                    }
                }
                if (priorKey !== undefined) {
                    execIteration(priorKey, i - 1, true)
                }
            }
        }

        if (i === 0) {
            ret = inverse(this)
        }

        return new SafeString(ret)
    })

    instance.registerHelper('log', function (data, options) {
        if (options.hash.writeToDom) {
            return JSON.stringify(data)
        }
        console.log(data)
    })

    instance.registerHelper('url', function (url, options) {
        const res = resolveUrl(url, options)
        return res && res.expectedPath
    })
}

module.exports = injectCoreHelpers
