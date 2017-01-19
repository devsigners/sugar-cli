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
const { isHttpUrl } = require('../helper/utils')
const { SafeString } = require('sugar-template/lib/utils')

const ctrlKeyMap = {
    embed: true,
    forceAbsolute: true,
    base: true,
    // wether merge css (move to head) and js (move to body)
    mergeAssets: true
}

const getAssetName = name => `__${name}`

const genAttrsStr = hash => {
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

function attachPromise (res, promise, processHtml) {
    if (res.promise) {
        res.promise = res.promise.then(html => {
            return promise.then(() => processHtml(html))
        })
    } else {
        res.promise = promise.then(() => processHtml(res.html))
    }
    return res
}

function cssPlugin (instance) {
    instance.on('post-render', onPostRender)
    instance.registerHelper('css', cssHelper)
    const renameFn = instance.setting.getAssetName || getAssetName
    return function unregister () {
        instance.unregisterHelper('css')
        instance.removeListener('post-render', onPostRender)
    }

    function onPostRender (res) {
        const list = res.resourceMap.css
        const tasks = []
        const files = list.filter(v => {
            if (!v.path) {
                v.path = join(res.config.root, v.expectedPath)
                v.relativePath = v.expectedPath
            } else {
                v.relativePath = relative(res.config.root, v.path)
            }
            if (v.mergeAssets) {
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
                targetUrl = `${destDir}/${renameFn(name)}.css`
                return ucprocessor.apply(files, [
                    {
                        name: 'concat',
                        options: { destFile: targetUrl }
                    },
                    {
                        name: 'autoprefixer'
                    }
                    // TODO: support option to control autoprefixer and minify
                    /** ,
                    {
                        name: 'minify'
                    } */
                ], options).then(joinedFile => {
                    // const destPath = relative(joinedFile.cwd, join(res.url, '..'))
                    return ucprocessor.writeMap(joinedFile, '.', {
                        destPath: '.',
                        includeContent: false
                    }).then(mapFile => {
                        mapFile.dest()
                        joinedFile.dest()
                    })
                })
            })
        }), html => {
            if (files.length) {
                return html.replace(/<\/head>/, `<link rel="stylesheet" href="${
                    basename(targetUrl)
                }" concated /></head>`)
            }
            return html
        })
    }

    function cssHelper (url, options) {
        const attrs = genAttrsStr(options.hash)
        const map = options.resourceMap.css
        // retrive url from token
        if (isHttpUrl(url)) {
            map[url] = false
            return new SafeString(`<link rel="stylesheet" href="${url}" ${attrs}>`)
        }
        const resolved = resolveUrl(url, options)
        resolved.mergeAssets = options.hash.mergeAssets || instance.setting.mergeAssets
        resolved.isPureCss = extname(url) === '.css'
        resolved.cssPath = resolved.expectedPath.replace(/\.\w+$/, '.css')
        resolved.includePaths = [
            join(resolved.path, '..'),
            join(options.$$page, '..'),
            options.$$configRoot
        ]
        map.push(resolved)
        return resolved.mergeAssets
            ? null
            : new SafeString(`<link rel="stylesheet" href="${resolved.cssPath}" ${attrs}>`)
    }
}

function jsPlugin (instance) {
    instance.on('post-render', onPostRender)
    instance.registerHelper('js', jsHelper)
    const renameFn = instance.setting.getAssetName || getAssetName
    return function unregister () {
        instance.unregisterHelper('js')
        instance.removeListener('post-render', onPostRender)
    }

    function onPostRender (res) {
        const list = res.resourceMap.js
        const tasks = list.filter(v => {
            if (!v.path) {
                v.path = join(res.config.root, v.expectedPath)
                v.relativePath = v.expectedPath
            } else {
                v.relativePath = relative(res.config.root, v.path)
            }
            if (v.mergeAssets) {
                return true
            }
        }).map(v => read(v.path))

        const name = basename(res.url, res.config.templateExt)
        let targetUrl
        attachPromise(res, Promise.all(tasks).then(files => {
            if (!tasks.length) {
                return
            }
            targetUrl = join(res.url, `../${renameFn(name)}.js`)
            return write(targetUrl, files.join('\n'))
        }), html => {
            if (tasks.length) {
                return html.replace(/<\/body>/, `<script src="${
                    basename(targetUrl)
                }" concated></script></body>`)
            }
            return html
        })
    }

    function jsHelper (url, options) {
        const attrs = genAttrsStr(options.hash)
        const map = options.resourceMap.js
        if (isHttpUrl(url)) {
            map[url] = false
            return new SafeString(`<script src="${url}" ${attrs}></script>`)
        }
        const resolved = resolveUrl(url, options)
        resolved.mergeAssets = options.hash.mergeAssets || instance.setting.mergeAssets
        map.push(resolved)
        return resolved.mergeAssets
            ? null
            : new SafeString(`<script src="${resolved.expectedPath}" ${attrs}></script>`)
    }
}

exports = module.exports = function injectCorePlugins (instance) {
    instance.registerPlugin('css', cssPlugin)
    instance.registerPlugin('js', jsPlugin)
}

exports.resolveUrl = resolveUrl
