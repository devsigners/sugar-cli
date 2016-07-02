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
    readFileSync
} = require('fs')
const {
    isEmpty,
    isFunction,
    SafeString
} = require('sugar-template/lib/utils')

const httpResRe = /^(https?:)\/\//i
const resolveUrl = (url, options, realUrl) => {
    const isRelative = !isAbsolute(url)
    let src = url
    if (isRelative) {
        let base = options.hash.base || options.$$base
        if (base) {
            if (extname(base)) base = join(base, '..')
            url = join(base, url)
        }
        // if just want real file path
        if (realUrl) return url

        if (options.hash.forceAbsolute && options.$$configRoot) {
            // Absolute to config.root -- static serve root
            src = resolve(sep, url.slice(options.$$configRoot.length))
        } else {
            // Relative to page url, not partial url
            src = relative(join(options.$$page, '..'), url)
        }
    }
    return src
}

module.exports = function(instance) {
    instance.registerHelper('js', function(url, options) {
        if (httpResRe.test(url)) return new SafeString(`<script src="${url}"></script>`)

        let src = resolveUrl(url, options, options.hash.embed)
        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(src, { encoding: 'utf8' })
            } catch (e) {}
            return new SafeString(`<script>${content}</script>`)
        }
        return new SafeString(`<script src="${src}"></script>`)
    })
    instance.registerHelper('css', function(url, options) {
        if (httpResRe.test(url)) return new SafeString(`<link rel="stylesheet" href="${url}">`)

        let src = resolveUrl(url, options, options.hash.embed)

        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(src, { encoding: 'utf8' })
            } catch (e) {}
            return new SafeString(`<style>${content}</style>`)
        }
        return new SafeString(`<link rel="stylesheet" href="${src}">`)
    })
    instance.registerHelper('img', function(url, options) {
        const alt = options.hash.alt || ''
        if (httpResRe.test(url)) return new SafeString(`<img src="${url}" alt="${alt}"/>`)

        let src = resolveUrl(url, options, options.hash.embed)

        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(src, { encoding: 'base64' })
                content = `data:image/${extname(src).slice(1)};base64,` + content
            } catch (e) {}
            return new SafeString(`<img src="${content}" alt="${alt}"/>`)
        }

        return new SafeString(`<img src="${src}" alt="${alt}"/>`)
    })
}
