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
        } : {}, (err, data) =>  err ? reject(err) : resolve(data))
    })
}

const write = (filename, content, createDirIfNotExists, options) => {
    return new Promise((resolve, reject) => {
        let dir = createDirIfNotExists && filename && path.parse(filename).dir
        let promise = createDirIfNotExists ? exist(dir).catch(() => {
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
    let isAbsolute = parts[0] === ''
    while ((part = parts.shift()) != null) {
        if (part === '') {
            realUrl += '/'
        } else {
            realUrl = path.join(realUrl, part)
            let stat = fs.lstatSync(realUrl)
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
    let res = parseRe.exec(content)
    return res ? {
        metadata: parseYaml(res[1]),
        content: content.slice(res[0].length)
    } : {
        content: content
    }
}

const merge = (target, source, ...rest) => {
    if (rest.length) return merge(merge(target, source), ...rest)
    for (let prop in source) {
        if (isObject(source[prop]) && isObject(target[prop])) {
            merge(target[prop], source[prop])
        } else {
            target[prop] = source[prop]
        }
    }
    return target
}

// only merge property that target has
const mergeFields = function(target, source) {
    if (rest.length) return mergeFields(mergeFields(target, source), ...rest)
    for (let prop in source) {
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
    for (let prop in obj) {
        return false
    }
    return true
}

// -name|path=full|test=1,2,3
// {
//     name: false,
//     path: 'full',
//     test: [1,2,3]
// }
const parseString = (str) => {
    if (!str) return null
    const map = {}
    (str + '').split('|').forEach(v => {
        let pairs = v.split('=')
        let res
        if (pairs.length === 1) {
            res = /^(-|\+?)([\S]+)$/.exec(pairs[0])
            if (!res) return
            map[res[2]] = res[1] !== '-'
        } else if (pairs.length === 2) {
            map[pairs[0]] = /,/.test(pairs[1]) ? pairs[1].split(',') : pairs[1]
        }
    })
    return map
}

const genUniqueKey = () => Date.now().toString() + Math.random().toString().slice(-4)

/**
 * access object property via deep propertyName
 * @param  {Object} obj          source object
 * @param  {String} propertyName property name, could be like 'user.name'
 * @return {Any}                 the value
 */
const accessDeepProperty = (obj, propertyName) => {
    let names = propertyName.split('.')
    names.some((p, i) => {
        obj = obj[p]
        if (!(obj instanceof Object)) {
            i < names.length - 1 && (obj = undefined)
            return true
        }
    })
    return obj
}

module.exports = {
    merge,
    mergeFields,
    isPlainObject,
    read,
    exist,
    mkdir,
    list,
    write,
    rm,
    readlinkSync,
    parseYaml,
    parseMixedYaml,
    parseString,
    genUniqueKey,
    accessDeepProperty
}
