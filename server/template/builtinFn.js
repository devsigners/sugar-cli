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

const mergeStyles = (list, config, pageUrl, project, map) => {
    const sharedStyles = []
    const localeStyles = []
    const sharedIndexes = []
    const localeIndexes = []
    list.forEach((url, i) => {
        if (isAbsolute(url)) {
            const absUrl = join(config.root, url.slice(1))
            if (url.startsWith(`/${config.shared}/`)) {
                sharedStyles.push(absUrl)
                sharedIndexes.push(i)
            } else {
                localeStyles.push(absUrl)
                localeIndexes.push(i)
            }
        } else {
            const absUrl = resolve(join(pageUrl, '..'), url)
            if (relative(config.root, absUrl).startsWith(`${config.shared}/`)) {
                sharedStyles.push(absUrl)
                sharedIndexes.push(i)
            } else {
                localeStyles.push(absUrl)
                localeIndexes.push(i)
            }
        }
    })
    const name = basename(pageUrl, config.templateExt)
    const mergedStyles = []
    if (sharedStyles.length > 1) {
        const mergedShareStyleUrl = join(config.root, `${config.shared}/_${project}_${name}.css`)
        writeFileSync(mergedShareStyleUrl, sharedStyles.map(url => readFileSync(url, { encoding: 'utf8' })).join('\n'))
        mergedStyles.push(`<link rel="stylesheet" href="${relative(pageUrl, mergedShareStyleUrl)}">`)
    } else {
        mergedStyles.push(...sharedIndexes.map(i => map[list[i]]))
    }
    if (localeStyles.length > 1) {
        const mergedLocaleStyleUrl = join(pageUrl, `../_merged_${name}.css`)
        writeFileSync(mergedLocaleStyleUrl, localeStyles.map(url => readFileSync(url, { encoding: 'utf8' })).join('\n'))
        mergedStyles.push(`<link rel="stylesheet" href="./_merged_${name}.css">`)
    } else {
        mergedStyles.push(...localeIndexes.map(i => map[list[i]]))
    }
    return mergedStyles
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
            let list
            if (instance.__setting__.autoMergeCss && record.__head__.length > 1) {
                list = mergeStyles(record.__head__, config, pageUrl, project, record)
            } else {
                list = record.__head__.map(url => record[url])
            }
            res.html = res.html.replace(/<\/\s*head\s*>/,
                `${list.join('\n')}</head>`)
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
