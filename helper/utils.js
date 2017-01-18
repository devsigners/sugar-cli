const { read, readSync, existsSync } = require('./fs')
const { sep, basename } = require('path')
const yaml = require('yamljs')
const minimatch = require('minimatch')

/**
 * handle yaml
 */

const parseRe = /^\s*\-{3,3}([\S\s]+?)\-{3,3}/i
const parseYaml = (content) => {
    return content && typeof content === 'string' ? yaml.parse(content) : null
}
const parseMixedYaml = (content) => {
    const res = parseRe.exec(content)
    return res ? {
        metadata: parseYaml(res[1]),
        content: content.slice(res[0].length)
    } : {
        content
    }
}
const toYaml = (obj, spaceLen = 4) => yaml.stringify(obj, spaceLen)

/**
 * load data
 */

const dataTypeMap = {
    '.yml': parseYaml,
    '.yaml': parseYaml,
    '.json': JSON.parse
}
const loadData = (url, type, sync) => {
    if (!type) type = path.extname(url)

    if (type === '.js') {
        return sync ? require(url) : new Promise((resolve) => {
            resolve(require(url))
        })
    }

    const parse = dataTypeMap[type] || parseYaml
    if (sync) return parse(readSync(url, { encoding: 'utf8' }))
    return read(url).then(data => parse(data))
}
const tryAndLoadData = (url, types, sync, setBack) => {
    if (!types || !types.length) {
        return sync ? false : Promise.resolve(null)
    }
    let res
    if (types.some(type => {
        if (existsSync(url + type)) {
            res = loadData(url + type, type, sync)
            setBack && (setBack.ext = type) // inner usage
            return true
        }
    })) {
        return res
    }
    return sync ? false : Promise.resolve(null)
}

/**
 * common utils
 */
// exclude function, Date, RegExp and so on
const isObject = (obj) => {
    return Object.prototype.toString.call(obj) === '[object Object]'
}

const merge = (target, source, ...rest) => {
    if (rest.length) return merge(merge(target, source), ...rest)
    for (const prop in source) {
        if (isObject(source[prop]) && isObject(target[prop])) {
            merge(target[prop], source[prop])
        } else {
            target[prop] = source[prop]
        }
    }
    return target
}

const isHttpUrl = (url) => {
    return url && /^http(s):\/\//.test(url)
}

// get project directory from url
// 1. /mydir/index.html --> mydir
// 2. /mygroup/myproj/x.html --> mygroup/myproj
const getDirectoryFromUrl = (url, globs) => {
    parts = url.split(sep).filter(p => p)
    const name = basename(url)
    let cur = parts[0]
    if (!globs) {
        if (!cur || basename(cur) === name) return ''
        return cur
    }

    for (let i = 1, len = parts.length; i < len; i++) {
        if (minimatch(cur, globs)) return cur
        cur += `/${parts[i]}`
    }

    cur = parts[0]
    return basename(cur) === name ? '' : cur
}

const genUniqueKey = () => {
    return '$sugar$' + (Math.random() + '').slice(8) + Date.now()
}

module.exports = {
    parseYaml,
    parseMixedYaml,
    toYaml,
    loadData,
    tryAndLoadData,
    merge,
    isHttpUrl,
    getDirectoryFromUrl,
    genUniqueKey
}
