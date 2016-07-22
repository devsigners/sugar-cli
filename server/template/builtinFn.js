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
const sass = require('node-sass')
const CleanCSS = require('clean-css')
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
        const minified = new CleanCSS({
            sourceMap: true,
            target: mergedShareStyleUrl
        }).minify(sharedStyles.reduce((pre, cur) => {
            pre[cur] = {
                styles: readFileSync(cur, { encoding: 'utf8' }),
                sourceMap: readFileSync(cur + '.map', { encoding: 'utf8' })
            }
        }, {}))
        writeFileSync(mergedShareStyleUrl, minified.styles)
        writeFileSync(mergedShareStyleUrl + '.map', minified.sourceMap)
        mergedStyles.push(`<link rel="stylesheet" href="${relative(pageUrl, mergedShareStyleUrl)}">`)
    } else {
        mergedStyles.push(...sharedIndexes.map(i => map[list[i]]))
    }
    if (localeStyles.length > 1) {
        const mergedLocaleStyleUrl = join(pageUrl, `../_merged_${name}.css`)
        const minified = new CleanCSS({
            sourceMap: true,
            target: mergedLocaleStyleUrl
        }).minify(localeStyles.reduce((pre, cur) => {
            pre[cur] = {
                styles: readFileSync(cur, { encoding: 'utf8' }),
                sourceMap: readFileSync(cur + '.map', { encoding: 'utf8' })
            }
            return pre
        }, {}))
        writeFileSync(mergedLocaleStyleUrl, minified.styles.toString() + `\n/*# sourceMappingURL=_merged_${name}.css.map */`)
        writeFileSync(mergedLocaleStyleUrl + '.map', minified.sourceMap.toString())

        mergedStyles.push(`<link rel="stylesheet" href="./_merged_${name}.css">`)
    } else {
        mergedStyles.push(...localeIndexes.map(i => map[list[i]]))
    }
    return mergedStyles
}

const compileSassSync = (setting) => {
    return sass.renderSync(setting)
}

module.exports = function(instance) {
    const PAGES_INFO = {}
    instance.on('renderstart', ({ url, localconfig, baseConfig, projectDir }) => {
        PAGES_INFO[url] = {
            pageUrl: url,
            project: projectDir,
            config: baseConfig,
            record: {
                __head__: [],
                __body__: []
            }
        }
    }).on('renderend', (res, url) => {
        if (!res || !res.html) return
        const info = PAGES_INFO[url]
        const record = info.record
        if (record.__head__.length) {
            let list
            if (instance.__setting__.autoMergeCss && record.__head__.length > 1) {
                list = mergeStyles(record.__head__, info.config, info.pageUrl, info.project, info.record)
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
        const record = PAGES_INFO[options.$$page].record
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

        const absPath = resolveUrl(url, options, true)
        url = resolveUrl(url, options, options.hash.embed)
        const record = PAGES_INFO[options.$$page].record
        const isSass = url.endsWith('.scss') || url.endsWith('.sass')
        let outFile, includePaths
        if (isSass) {
            url = url.replace(/s[ac]ss$/i, 'css')
            outFile = absPath.replace(/s[ac]ss$/i, 'css')
            includePaths = [join(options.$$page, '..'), options.$$configRoot]
        }
        if (record[url]) return

        if (options.hash.embed) {
            let content = ''
            try {
                content = readFileSync(absPath, { encoding: 'utf8' })
                if (isSass) {
                    content = compileSassSync({
                        data: content,
                        outFile,
                        includePaths,
                        sourceMap: true
                    })
                    writeFileSync(outFile + '.map', content.map, { encoding: 'utf8' })
                    content = content.css.toString()
                }
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
        // compile sass and write to the same dir
        if (isSass) {
            const res = compileSassSync({
                file: absPath,
                outFile,
                sourceMap: true,
                includePaths
            })
            writeFileSync(outFile, res.css, { encoding: 'utf8' })
            writeFileSync(outFile + '.map', res.map, { encoding: 'utf8' })
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
