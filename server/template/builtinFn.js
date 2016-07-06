/**
 * built-in helpers/filters
 */

const {
    isAbsolute,
    relative,
    resolve,
    join,
    sep,
    extname,
    basename
} = require('path')
const {
    readFileSync,
    writeFileSync
} = require('fs')
const {
    SafeString
} = require('sugar-template/lib/utils')

const httpResRe = /^(https?:)\/\//i
const resolveUrl = (url, options, wantFilepath) => {
    const isRelative = !isAbsolute(url)
    let src = url
    if (isRelative) {
        let base = options.hash.base || options.$$base
        if (base) {
            if (extname(base)) base = join(base, '..')
            url = join(base, url)
        }
        // if just want local file path
        if (wantFilepath) return url

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

const ctrlKeyMap = {
    embed: true,
    forceAbsolute: true,
    base: true,
    smartPos: true // css move to head, js move to body
}
const genAttrsStr = (hash) => {
    let attrs = ''
    for (const attr in hash) {
        if (!ctrlKeyMap[attr]) attrs += ` ${attr}="${hash[attr]}"`
    }
    return attrs
}

module.exports = function(instance) {
    let record, pageUrl, config, project
    instance.on('renderstart', ({ url, localconfig, baseConfig, projectDir }) => {
        record = {
            __head__: [],
            __body__: []
        }
        config = baseConfig
        pageUrl = url
        project = projectDir
    }).on('renderend', (res) => {
        if (!res || !res.html) return
        if (record.__head__.length) {
            const mergeStyles = [] // later merge to mergedStyle
            const insertStyles = record.__head__.filter(url => {
                if (isAbsolute(url) && url.startsWith(`/${config.shared}/`)) {
                    mergeStyles.push(join(config.root, url.slice(1)))
                    return false
                } else {
                    const absUrl = resolve(join(pageUrl, '..'), url)
                    if (relative(config.root, absUrl).startsWith(`${config.shared}/`)) {
                        mergeStyles.push(absUrl)
                        return false
                    }
                }
                return true
            }).map(url => record[url])
            const mergedStyleUrl = join(config.root, `${config.shared}/_${project}_${basename(pageUrl, config.templateExt)}.css`)
            insertStyles.push(
                `<link rel="stylesheet" href="${relative(pageUrl, mergedStyleUrl)}">`
            )
            writeFileSync(mergedStyleUrl, mergeStyles.map(url => readFileSync(url, { encoding: 'utf8' })).join('\n'))
            res.html = res.html.replace(/<\/\s*head\s*>/,
                `${insertStyles.join('\n')}</head>`)
        }
        if (record.__body__.length) {
            res.html = res.html.replace(/<\/\s*body\s*>/,
                `${record.__body__.map(url => record[url]).join('\n')}</body>`)
        }
    })
    instance.registerHelper('js', function(url, options) {
        const attrs = genAttrsStr(options.hash)
        if (httpResRe.test(url)) return new SafeString(`<script src="${url}" ${attrs}></script>`)

        let src = resolveUrl(url, options, options.hash.embed)
        // prevent duplicate
        if (record[src]) return
        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(src, { encoding: 'utf8' })
            } catch (e) {}
            record[src] = `<script ${attrs}>${content}</script>`
        } else {
            if (instance.__setting__.makeResUrlRelative) {
                src = isAbsolute(src) ? relative(
                        join(options.$$page, '..'),
                        join(options.$$configRoot, src)
                    ) : src
            }
            record[src] = `<script src="${src}" ${attrs}></script>`
        }
        if (options.hash.smartPos || instance.__setting__.resSmartPos) {
            record.__body__.push(url)
            return
        }
        return new SafeString(record[src])
    })
    instance.registerHelper('css', function(url, options) {
        const attrs = genAttrsStr(options.hash)
        if (httpResRe.test(url)) return new SafeString(`<link rel="stylesheet" href="${url}" ${attrs}>`)

        url = resolveUrl(url, options, options.hash.embed)
        if (record[url]) return
        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(url, { encoding: 'utf8' })
            } catch (e) {}
            record[url] = `<style ${attrs}>${content}</style>`
        } else {
            let src = url
            // support force relative setting from other config
            // maybe the only usage case is when build static
            if (instance.__setting__.makeResUrlRelative) {
                src = isAbsolute(src) ? relative(
                        join(options.$$page, '..'),
                        join(options.$$configRoot, src)
                    ) : src
            }
            record[url] = `<link rel="stylesheet" href="${src}" ${attrs}>`
        }
        if (options.hash.smartPos || instance.__setting__.resSmartPos) {
            record.__head__.push(url)
            return // dont ouput anything
        }
        return new SafeString(record[url])
    })
    instance.registerHelper('img', function(url, options) {
        const attrs = genAttrsStr(options.hash)
        if (httpResRe.test(url)) return new SafeString(`<img src="${url}" ${attrs}/>`)

        let src = resolveUrl(url, options, options.hash.embed)
        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(src, { encoding: 'base64' })
                content = `data:image/${extname(src).slice(1)};base64,` + content
            } catch (e) {}
            return new SafeString(`<img src="${content}" ${attrs}/>`)
        }
        if (instance.__setting__.makeResUrlRelative) {
            src = isAbsolute(src) ? relative(
                    join(options.$$page, '..'),
                    join(options.$$configRoot, src)
                ) : src
        }
        return new SafeString(`<img src="${src}" ${attrs}/>`)
    })
}
