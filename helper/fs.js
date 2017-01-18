const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const glob = require('glob-all')
const rimraf = require('rimraf')

const read = (filename, options) => {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, options || {
            encoding: 'utf8'
        }, (err, data) => err ? reject(err) : resolve(data))
    })
}

const exist = filename => {
    return new Promise((resolve, reject) => {
        fs.access(filename, err => err ? reject(err) : resolve(filename))
    })
}

const statSync = url => {
    try {
        return fs.statSync(url)
    } catch (error) {
        return false
    }
}

const rm = pattern => {
    return new Promise((resolve, reject) => {
        rimraf(pattern, err => err ? reject(err) : resolve())
    })
}

const mkdir = dir => {
    return new Promise((resolve, reject) => {
        mkdirp(dir, err => err ? reject(err) : resolve())
    })
}

const list = (root, pattern) => {
    return new Promise((resolve, reject) => {
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
            }, err => err ? reject(err) : resolve())
        })
    })
}

const readlinkSync = url => {
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

module.exports = {
    read,
    readSync: fs.readFileSync,
    exist,
    existsSync: fs.existsSync,
    statSync,
    mkdir,
    list,
    write,
    rm,
    readlinkSync
}
