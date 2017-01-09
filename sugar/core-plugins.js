const {
    isAbsolute,
    relative,
    resolve,
    join,
    sep,
    extname,
    basename
} = require('path')
const ucprocessor = require('universal-css-processor')
const { write, read } = require('../helper/fs')
const {
    isHttpUrl//,
    // genUniqueKey
} = require('../helper/utils')
const { SafeString } = require('sugar-template/lib/utils')

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

const resolveUrl = (url, options) => {
    const isRelative = !isAbsolute(url)
    const res = {}
    let src = url
    if (isRelative) {
        let base = options.hash.base || options.$$base
        if (base) {
            if (extname(base)) base = join(base, '..')
            url = join(base, url)
        }
        res.path = url

        if (options.hash.forceAbsolute && options.$$configRoot) {
            // Absolute to config.root -- static serve root
            src = resolve(sep, url.slice(options.$$configRoot.length))
        } else {
            // Relative to page url, not partial url
            src = relative(join(options.$$page, '..'), url)
        }
    } else {
        res.path = url
    }
    res.expectedPath = src
    return res
}

function attachPromise(res, promise, processHtml) {
    if (res.promise) {
        promise = res.promise.then(html => {
            return promise.then(() => processHtml(html))
        })
    } else {
        res.promise = promise.then(() => processHtml(res.html))
    }
    return res
}

/**
 * CSS Plugin
 * 1. register css helper
 * 2. enhance css helper (support sass/less/postcss)
 */
function cssPlugin(instance) {
    instance.on('post-render', (res) => {
        const list = res.resourceMap.css
        const tasks = []
        const files = list.filter(v => {
            if (!v.path) {
                v.path = join(res.config.root, v.expectedPath)
                v.relativePath = v.expectedPath
            } else {
                v.relativePath = relative(res.config.root, v.path)
            }
            if (v.autoAdjustPos) {
                return true
            }
            // not pure css, and need to compile
            else if (!v.isPureCss) {
                tasks.push(ucprocessor.process(
                    [v.relativePath],
                    [
                        { name: extname(v.path).slice(1) },
                        { name: 'autoprefixer' }
                    ],
                    {
                        cwd: res.config.root,
                        base: res.config.root,
                        map: true
                    }
                ).then(files => {
                    const file = files[0]
                    const destPath = relative(file.cwd, file.base)
                    return ucprocessor.writeMap(file, '.', { destPath, includeContent: false })
                        .then(mapFile => {
                            mapFile.dest(destPath)
                            file.dest(destPath)
                        })
                }))
            }
        }).map(v => v.relativePath)
        const name = basename(res.url, res.config.templateExt)
        let targetUrl
        attachPromise(res, Promise.all(tasks).then(() => {
            if (!files.length) {
                return
            }
            const options = {
                cwd: res.config.root,
                base: res.config.root,
                map: true
            }
            return Promise.all(
                files.map(file => {
                    // support mix less/sass/postcss
                    return ucprocessor.process([file], [
                        { name: extname(file).slice(1) }
                    ], options)
                })
            ).then(files => {
                // flat files, files is like [[File], [File]]
                files = files.reduce((prev, file) => prev.concat(file), [])
                const destDir = relative(res.config.root, join(res.url, '..'))
                targetUrl = `${destDir}/__c_${name}.css`
                return ucprocessor.apply(files, [
                    {
                        name: 'concat',
                        options: { destFile: targetUrl }
                    },
                    {
                        name: 'autoprefixer'
                    }/**,
                    {
                        name: 'minify'
                    }*/
                ], options).then(joinedFile => {
                    const destPath = relative(joinedFile.cwd, join(res.url, '..'))
                    return ucprocessor.writeMap(joinedFile, '.', {
                        destPath: '.',
                        includeContent: false
                    }).then(mapFile => {
                        mapFile.dest()
                        joinedFile.dest()
                    })
                })
            })
        }), (html) => {
            if (files.length) {
                return html.replace(/<\/head>/, `<link rel="stylesheet" href="${
                    basename(targetUrl)
                }" concated /></head>`)
            }
            return html
        })
    })

    instance.registerHelper('css', cssHelper)

    function cssHelper(url, options) {
        const attrs = genAttrsStr(options.hash)
        const map = options.resourceMap.css
        // retrive url from token
        if (isHttpUrl(url)) {
            map[url] = false
            return new SafeString(`<link rel="stylesheet" href="${url}" ${attrs}>`)
        }
        const resolved = resolveUrl(url, options)
        resolved.autoAdjustPos = options.hash.autoAdjustPos || instance.setting.autoAdjustPos
        resolved.isPureCss = extname(url) === '.css'
        resolved.cssPath = resolved.expectedPath.replace(/\.\w+$/, '.css')
        resolved.includePaths = [
            join(resolved.path, '..'),
            join(options.$$page, '..'),
            options.$$configRoot
        ]
        map.push(resolved)
        return resolved.autoAdjustPos
            ? null
            : new SafeString(`<link rel="stylesheet" href="${resolved.cssPath}" ${attrs}>`)
    }
}

module.exports = function injectCorePlugins(instance) {
    instance.registerPlugin('css', cssPlugin)

    instance.registerHelper('js', function() {
        // TODO: write js plugin
        return new SafeString(`<script invalid></script>`)
    })
}
