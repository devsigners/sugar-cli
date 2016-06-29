/**
 * built-in helpers/filters
 */

const {
    isAbsolute,
    relative,
    resolve,
    join,
    sep,
    extname
} = require('path')
const {
    isEmpty,
    isFunction,
    SafeString
} = require('sugar-template/lib/utils')

const httpResRe = /(https?:)\/\/.test(url)/i

module.exports = function(instance) {
    instance.registerHelper('js', function(url, options) {
        let src = url
        const isRelative = !httpResRe.test(url) && !isAbsolute(url)
        if (isRelative) {
            let base = options.hash.base || options.$$base
            if (base) {
                if (extname(base)) base = join(base, '..')
                url = join(base, url)
            }
        }

        // Finally, we should relative to page url, not partial url
        if (isRelative) {
            if (options.hash.forceAbsolute && options.$$configRoot) {
                src = resolve(sep, url.slice(options.$$configRoot.length))
            } else {
                src = relative(join(options.$$page, '..'), url)
            }
        }

        return new SafeString(`<script src="${src}"></script>`)
    })
    instance.registerHelper('css', function(url, options) {
        let src = url
        const isRelative = !httpResRe.test(url) && !isAbsolute(url)
        if (isRelative) {
            let base = options.hash.base || options.$$base
            if (base) {
                if (extname(base)) base = join(base, '..')
                url = join(base, url)
            }
        }

        if (options.hash.embed) {
            return new SafeString(`<style>${'lala'}</style>`)
        }
        // Finally, we should relative to page url, not partial url
        if (isRelative) {
            if (options.hash.forceAbsolute && options.$$configRoot) {
                src = resolve(sep, url.slice(options.$$configRoot.length))
            } else {
                src = relative(join(options.$$page, '..'), url)
            }
        }

        return new SafeString(`<link rel="stylesheet" href="${src}">`)
    })
    instance.registerHelper('img', function(url, options) {
        const alt = options.hash.alt || ''
        let src = url
        const isRelative = !httpResRe.test(url) && !isAbsolute(url)
        if (isRelative) {
            let base = options.hash.base || options.$$base
            if (base) {
                if (extname(base)) base = join(base, '..')
                url = join(base, url)
            }
        }

        if (options.hash.embed) {
            return new SafeString(`<img src="base64" alt="${alt}"/>`)
        }
        // Finally, we should relative to page url, not partial url
        if (isRelative) {
            if (options.hash.forceAbsolute && options.$$configRoot) {
                src = resolve(sep, url.slice(options.$$configRoot.length))
            } else {
                src = relative(join(options.$$page, '..'), url)
            }
        }

        return new SafeString(`<img src="${src}" alt="${alt}"/>`)
    })
}
