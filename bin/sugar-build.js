#!/usr/bin/env node

const { join, sep, isAbsolute, resolve, relative, normalize } = require('path')
const colors = require('colors/safe')
const program = require('./command')
const {
    tryAndLoadData,
    merge,
    getDirectoryFromUrl
} = require('../helper/utils')
const { existsSync, list, read, write } = require('../helper/fs')
const logger = require('./logger')
const { createRenderer } = require('../sugar/koa-middleware')
const Sugar = require('../sugar/core')

program
    .option('-d, --dest <dir>', 'dest directory')
    .option('-s, --src <dir>', 'source directory, default to `config.template.root`')
    .option('--src-file <dir>', 'source file, take precede over `src`')
    .option('--htmls <patterns>', 'pattern to list html files, such as "**/*.html,!_.html"', patterns => {
        return patterns && patterns.split(',')
    })
    .option('--strict', 'only process htmls in directory with config file')
    .option('--verbose', 'output processing details')
    .option('--no-assets', 'whether copy assets')
    .option('--ignore-errors', 'ignore template build error and continue process')
    .on('--help', () => {
        console.log(colors.green('  Examples:'))
        console.log()
        console.log(colors.gray('    $ sugar build sugar.config.js -d dest'))
    })
    .parse(process.argv)

const configFileUrl = program.args[0]

build(configFileUrl, program.dest, program.verbose, {
    htmls: program.htmls,
    srcFile: program.srcFile,
    srcDir: program.src,
    strict: program.strict,
    assets: program.assets,
    ignoreErrors: program.ignoreErrors
})

function build (configFileUrl, dest, verbose, options) {
    // NOTE: Check if we should output render process info?
    if (verbose) {
        logger.level = 0
    } else {
        logger.level = 2
    }
    // Dont output details of sugar core
    process.env.LOGLEVEL = 5

    const { destDir, config } = prepare(dest, configFileUrl)
    const buildConfig = config.build || {}
    // Cli has higher priority
    Object.keys(options).forEach(p => {
        if (options[p] != null) {
            buildConfig[p] = options[p]
        }
    })

    if (buildConfig.ignoreErrors) {
        process.on('unhandledRejection', err => {
            logger.warn(`unhandled rejection: ${err.message || err.toString()}`)
        })
        process.on('rejectionHandled', () => {
            logger.warn(`rejection handled after one turn of event loop`)
        })
    }

    function reportSuccess () {
        console.log()
        console.log(colors.bold(colors.green('  Success!')))
        console.log(colors.gray(`  see ${destDir} for all build files`))
    }

    return getHTMLFiles(config.template, buildConfig).then(fileList => {
        let len = fileList && fileList.length
        if (len) {
            const promises = []
            const core = new Sugar()
            merge(core.setting, {
                disableCache: true,
                mergeAssets: true
            }, config.extra)
            const render = createRenderer(core, config.template)
            while (len--) {
                const file = fileList[len]
                promises.push(render({
                    path: join('/', file)
                }).then(html => {
                    logger.log(`File ${file} processed`)
                    return write(join(destDir, file), html, true)
                }, err => {
                    logger.error(`File ${file} has a problem.`)
                    if (buildConfig.ignoreErrors) return
                    if (err instanceof Error) {
                        throw err
                    } else {
                        throw new Error(err)
                    }
                }))
            }
            return Promise.all(promises).then(() => {
                logger.info('All templates processed')
                // If only build one file, don't copy assets.
                if (buildConfig.assets && !buildConfig.srcFile) {
                    return copyAssets(config.template, destDir, buildConfig.assets).then(() => {
                        logger.info('All assets copied')
                    })
                }
            }).then(() => {
                if (buildConfig.ignoreErrors) {
                    setTimeout(reportSuccess)
                } else {
                    reportSuccess()
                }
            })
        } else {
            console.log()
            console.log(colors.bold(colors.green('  Done (no files processed)!')))
            if (!verbose) {
                console.log(colors.gray(`  use --verbose to see details`))
            }
            logger.exit(null, null, 0)
        }
    }).catch(e => {
        logger.error(`Error occurred while building, detail is:`)
        logger.error(e.stack.toString())
        logger.exit(null, null, 1)
    })
}

function prepare (destDir, configFileUrl) {
    // Check configFileUrl.
    if (!configFileUrl) {
        configFileUrl = 'sugar.config.js'
        logger.warn(`configFileUrl unspecified, will use "sugar.config.js"`)
    }

    // Prepare config.
    const config = {}
    let specifiedConfig
    try {
        configFileUrl = resolve(configFileUrl)
        if (!existsSync(configFileUrl)) {
            logger.warn(`no such file "${configFileUrl}"`, true)
        } else {
            specifiedConfig = require(configFileUrl)
        }
        const defaultConfig = require('../helper/config.js')
        // Don't use defaultConfig's build path
        defaultConfig.build.dest = null
        merge(config, defaultConfig, specifiedConfig)
        // If not specified, use cwd as root.
        if (!specifiedConfig) {
            config.template.root = process.cwd()
        }
        logger.log(`config is %j`, true, config)
    } catch (e) {
        logger.exit(`Error occured when get config info`, e.stack.toString(), 1)
    }

    // Prepare destDir.
    if (!destDir) {
        destDir = config.build.dest
        logger.warn(`destDir unspecified, will use config.build.dest "${destDir}"`)
        if (!config.build.dest) {
            logger.exit('Error: no valid dest directory found', 'config.build.dest & destDir are all unspecified', 1)
        }
    }
    destDir = isAbsolute(destDir) ? destDir : join(process.cwd(), destDir)

    return {
        config,
        destDir
    }
}

function getHTMLFiles (templateConfig = {}, { srcFile, srcDir, strict, htmls = [], ignoreBuiltinPatterns } = {}) {
    const templateExt = templateConfig.templateExt
    let dir
    if (srcFile) {
        srcFile = isAbsolute(srcFile) ? srcFile : join(process.cwd(), srcFile)
        if (!existsSync(srcFile)) {
            logger.exit(`no such file "${srcFile}" (srcFile)`, '', 1)
        }
        return Promise.resolve([relative(templateConfig.root, srcFile)])
    } else if (srcDir) {
        srcDir = normalize(`${
            isAbsolute(srcDir) ? srcDir : join(process.cwd(), srcDir)
        }/`)
        if (!existsSync(srcDir)) {
            logger.exit(`no such file "${srcDir}" (srcDir)`, '', 1)
        }
        if (srcDir === templateConfig.root || srcDir === normalize(templateConfig.root + '/')) {
            dir = srcDir
            srcDir = ''
        } else if (srcDir.indexOf(templateConfig.root) !== 0) {
            logger.exit(`srcDir "${srcDir}" is not a subdir of config's root`, '', 1)
        } else {
            dir = srcDir
        }
    } else {
        dir = templateConfig.root
    }

    if (!ignoreBuiltinPatterns) {
        if (templateConfig.shared) {
            htmls.unshift('!' + templateConfig.shared + '/**/*' + templateExt)
        }
        htmls.unshift(
            '**/*' + templateExt,
            '!**/node_modules/**/*' + templateExt,
            '!**/bower_modules/**/*' + templateExt,
            '!**/_*' // exclude _xxx.html
        )
    }
    return list(dir, htmls).then(files => {
        if (srcDir) {
            const subdir = relative(templateConfig.root, srcDir)
            files = files.map(file => join(subdir, file))
        }
        logger.log(`Files captured by pattern [${files.length}]:\n\t${
            files.length ? files.join('\n\t') : 'None'
        }`)

        if (!files.length) return

        const excludeFiles = []
        const fileList = files.map(file => {
            const projectDir = getDirectoryFromUrl(join('/', file), templateConfig.groups)
            const localConfig = tryAndLoadData(
                join(templateConfig.root, projectDir, templateConfig.configFilename),
                templateConfig.dataExts,
                true
            )
            if (!localConfig) {
                if (strict) {
                    excludeFiles.push(file)
                    return
                }
            } else {
                const parts = file.split(sep)
                if (
                    parts.length > 2 && (
                        parts[1] === (localConfig.layout || templateConfig.layout) ||
                        parts[1] === (localConfig.partial || templateConfig.partial)
                    )
                ) {
                    excludeFiles.push(file)
                    return
                }
            }
            return file
        }).filter(file => !!file)
        logger.log(`Files will be excluded [${excludeFiles.length}]:\n\t${
            excludeFiles.length ? excludeFiles.join('\n\t') : 'None'
        }`)

        return fileList
    })
}

function copyAssets (templateConfig, destDir, assets) {
    if (!Array.isArray(assets)) {
        assets = [
            '**/*.js',
            '**/*.css',
            '**/*.{png,jpg,gif,webp}',
            '**/*.{svg,eot,ttf,otf,woff}',
            '**/*.{mp3,mp4,ogg,wav,aac,webm}',
            '!**/node_modules/**/*.*',
            '!**/bower_modules/**/*.*',
            '!**/sugar.config.js'
        ]
    }
    return list(templateConfig.root, assets).then(files => {
        logger.log(`Static resources captured by pattern [${files.length}]:\n\t${
            files.length ? files.join('\n\t') : 'None'
        }`)
        const promises = files.map(file => {
            return read(join(templateConfig.root, file), {}).then(data => {
                logger.log(`File ${file} processed.`)
                return write(join(destDir, file), data, true, {})
            })
        })
        return Promise.all(promises)
    })
}
