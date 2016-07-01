const fs = require('fs')
const path = require('path')
const yaml = require('yamljs')
const mkdirp = require('mkdirp')
const glob = require('glob-all')
const rimraf = require('rimraf')

/**
 * read file content
 * @param  {String} filename file path
 * @param  {Object} options  options
 * @return {Object}          promise
 */
const read = (filename, options) => {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, options || {
            encoding: 'utf8'
        }, (err, data) => err ? reject(err) : resolve(data))
    })
}

/**
 * check path exists
 * @param  {String} filename path
 * @return {Object}          promise
 */
const exist = (filename) => {
    return new Promise((resolve, reject) => {
        fs.access(filename, err => err ? reject(err) : resolve(filename))
    })
}

const statSync = (url) => {
    try {
        return fs.statSync(url)
    } catch (error) {
        return false
    }
}

const rm = (pattern) => {
    return new Promise((resolve, reject) => {
        rimraf(pattern, (err) => err ? reject(err) : resolve())
    })
}

const mkdir = (dir) => {
    return new Promise((resolve, reject) => {
        mkdirp(dir, (err) => err ? reject(err) : resolve())
    })
}

const list = (root, pattern) => {
    return new Promise(function(resolve, reject) {
        glob(pattern, root ? {
            cwd: root
        } : {}, (err, data) => err ? reject(err) : resolve(data))
    })
}

const write = (filename, content, createDirIfNotExists, options) => {
    return new Promise((resolve, reject) => {
        const dir = createDirIfNotExists && filename && path.parse(filename).dir
        const promise = createDirIfNotExists ? exist(dir).catch(() => {
            return mkdir(dir)
        }) : Promise.resolve(null)
        promise.then(() => {
            fs.writeFile(filename, content, options || {
                encoding: 'utf8'
            }, (err) => err ? reject(err) : resolve())
        })
    })
}

const readlinkSync = (url) => {
    const parts = url.split(path.sep)
    let realUrl = ''
    let part
    const isAbsolute = parts[0] === ''
    while ((part = parts.shift()) != null) {
        if (part === '') {
            realUrl += '/'
        } else {
            realUrl = path.join(realUrl, part)
            const stat = fs.lstatSync(realUrl)
            if (stat.isSymbolicLink()) {
                // '/tmp' --> 'private/tmp', loss absolute
                realUrl = fs.readlinkSync(realUrl)
            }
            if (isAbsolute) {
                realUrl = path.join('/', realUrl)
            }
        }
    }
    return realUrl
}

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
        content: content
    }
}

const toYaml = (obj, spaceLen = 4) => yaml.stringify(obj, spaceLen)

const configTypeMap = {
    '.yml': parseYaml,
    '.yaml': parseYaml,
    '.json': JSON.parse
}
const loadConfig = (url, type, sync) => {
    if (!type) type = path.extname(url)
    // if js, always sync
    if (type === '.js') {
        const cfg = require(url)
        return cfg.config || cfg
    }

    const parse = configTypeMap[type] || parseYaml
    if (sync) return parse(fs.readFileSync(url))
    return read(url).then(data => parse(data))
}
// url has not extension
const tryAndLoadConfig = (url, types, sync) => {
    if (!types || !types.length) return false
    let res = false
    types.some(type => {
        if (statSync(url + type)) {
            res = loadConfig(url + type, type, sync)
            return true
        }
    })
    return res
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

// only merge property that target has
const mergeFields = function(target, source, ...rest) {
    if (rest.length) return mergeFields(mergeFields(target, source), ...rest)
    for (const prop in source) {
        if (!(prop in target)) continue
        if (isObject(source[prop]) && isObject(target[prop])) {
            mergeFields(target[prop], source[prop])
        } else {
            target[prop] = source[prop]
        }
    }
    return target
}

// exclude function, Date, RegExp and so on
const isObject = (obj) => {
    return Object.prototype.toString.call(obj) === '[object Object]'
}

const isPlainObject = (obj) => {
    if (!obj || !Object.prototype.isPrototypeOf(obj)) return false
    for (const prop in obj) { // eslint-disable-line
        return false
    }
    return true
}

module.exports = {
    merge,
    mergeFields,
    isPlainObject,
    read,
    exist,
    statSync,
    mkdir,
    list,
    write,
    rm,
    readlinkSync,
    parseYaml,
    parseMixedYaml,
    toYaml,
    loadConfig,
    tryAndLoadConfig
}
