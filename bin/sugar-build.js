#!/usr/bin/env node

const {
    join,
    sep,
    isAbsolute
} = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    merge,
    list,
    write,
    read,
    getProjectDir,
    tryAndLoadConfig
} = require('../utils')
const log = require('./logger')('sugar-build')
const createRenderer = require('../server/template/koa-middleware').createRenderer

program
    .option('-d, --dest <dir>', 'Specify dest dir')
    .option('--replace-abs', 'Replace all absolute urls with relative ones')
    .option('--strict', 'Only process htmls inside dir with "project.yml"')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar build <configFileUrl> --dest dest'.grey)
    })
    .parse(process.argv)

const configFileUrl = program.args[0]

build(configFileUrl, program.dest || '', {
    replaceAbs: program.replaceAbs,
    strict: program.strict
})

function build(configFileUrl, destDir, options) {
    if (!configFileUrl) {
        logHelpInfo(`When build, configFileUrl is required.`, 'Usage: $ sugar build <configFileUrl> [options]')
        process.exit(0)
    }

    const config = {}
    try {
        configFileUrl = isAbsolute(configFileUrl) ? configFileUrl : join(process.cwd(), configFileUrl)
        const defaultConfig = require(join(__dirname, 'res/sugar.config.js'))
        defaultConfig.build.dest = null // don't use defaultConfig's build path
        merge(config, defaultConfig, require(configFileUrl))
    } catch (e) {
        log(`Can not parse config file correctly.`, 'red')
        log(`"${configFileUrl}" is invalid or not exist.`, 'gray')
        log(e.stack.toString(), 'gray')
        process.exit(0)
    }

    const templateConfig = config.template
    const templateExt = templateConfig.templateExt

    if (!destDir) {
        if (!config.build.dest) {
            log(`You dont set build dest!`, 'red')
            process.exit(0)
        }
        destDir = config.build.dest
    }
    destDir = isAbsolute(destDir) ? destDir : join(process.cwd(), destDir)

    list(templateConfig.root, [
        '**/*' + templateExt,
        '!' + templateConfig.shared + '/**/*' + templateExt,
        '!**/node_modules/**/*' + templateExt,
        '!**/bower_modules/**/*' + templateExt,
        '!**/_*' // exclude _xxx.html
    ].concat(config.build.htmlPattern || [])).then(files => {
        log(`Files captured by pattern [${files.length}]:\n\t${
            files.length ? files.join('\n\t') : 'None'
        }`)
        if (!files.length) return
        const excludeFiles = []
        const fileList = files.map(file => {
            const projectDir = getProjectDir(join('/', file), templateConfig.isProjectGroup)
            const localConfig = tryAndLoadConfig(
                join(templateConfig.root, projectDir, templateConfig.configFilename),
                ['.yml', '.yaml', '.json', '.js'],
                true
            )
            if (!localConfig && options.strict) {
                excludeFiles.push(file)
            } else {
                const parts = file.split(sep)
                if (
                    parts.length > 2 &&
                    (parts[1] === (localConfig && localConfig.layout || templateConfig.layout) ||
                    parts[1] === (localConfig && localConfig.partial || templateConfig.partial))
                ) {
                    excludeFiles.push(file)
                    return null
                }
            }
            return file
        }).filter(file => !!file)

        log(`Files will be excluded [${excludeFiles.length}]:\n\t${
            excludeFiles.length ? excludeFiles.join('\n\t') : 'None'
        }`)

        return fileList
    }).then(fileList => {
        let len = fileList && fileList.length
        if (len) {
            const promises = []
            const writer = require('../server/template/sugar-server')
            if (options.replaceAbs) {
                writer.__setting__.makeResUrlRelative = true
            }
            const render = createRenderer(writer, templateConfig)
            while (len--) {
                const file = fileList[len]
                promises.push(render({}, join('/', file)).then(html => {
                    log(`File ${file} processed.`)
                    return write(join(destDir, file), html, true)
                }))
            }
            return Promise.all(promises)
        }
    }).then(() => {
        log('All htmls processed!', 'green')
        console.log()
        log('Now process static resources.')

        return list(templateConfig.root, [
            '**/*.js',
            '**/*.css',
            '**/.*.css',
            '**/*.{png,jpg,gif,webp}',
            '**/*.{svg,eot,ttf,otf,woff}',
            '**/*.{mp3,mp4,ogg,wav,aac,webm}',
            '!**/node_modules/**/*.*',
            '!**/bower_modules/**/*.*'
        ]).then(files => {
            log(`Static resources captured by pattern [${files.length}]:\n\t${
                files.length ? files.join('\n\t') : 'None'
            }`)
            const promises = files.map(file => {
                return read(join(templateConfig.root, file), {}).then(data => {
                    log(`File ${file} processed.`)
                    return write(join(destDir, file), data, true, {})
                })
            })
            return Promise.all(promises)
        })
    }).then(() => {
        log('All static resources processed!', 'green')
    }).catch(e => {
        console.log()
        log('Sorry, some errors occurred.', 'gray')
        log(e.stack.toString(), 'red')
        console.log()
    })
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help build'.grey)
}
