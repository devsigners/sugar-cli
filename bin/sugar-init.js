#!/usr/bin/env node

const { resolve, dirname, join, extname } = require('path')
const spawn = require('child_process').spawn
const colors = require('colors/safe') // eslint-disable-line
const program = require('./command')
const { read, write, list } = require('../helper/fs')
const logger = require('./logger')

program
    .option('-c, --clean', 'clean target directory')
    .option('-D, --no-demo', 'init without demo')
    .option('--autorun', 'auto run dev server after initiation')
    .option('--verbose', 'output processing details')
    .on('--help', () => {
        console.log(colors.green('  Examples:'))
        console.log()
        console.log(colors.gray('    $ sugar init targetDir'))
    })
    .parse(process.argv)

setup(program.args[0], program.demo, program.autorun, program.verbose)

function setup (targetDir, withDemo, autorun, verbose) {
    if (verbose) {
        process.env.LOGLEVEL = 0
        logger.level = 0
    } else {
        process.env.LOGLEVEL = 5
        logger.level = 5
    }

    getTargetDir(targetDir).then(targetDir => {
        logger.log(`final targetDir is ${targetDir}`)

        const tasks = []
        // 1. write project config file
        tasks.push(
            read(join(__dirname, '../helper/config.js')).then(content => {
                content = content.replace(`process.cwd()`, '__dirname')
                return write(
                    join(targetDir, 'sugar.config.js'),
                    content,
                    true
                ).then(() => logger.info('file "sugar.config.js" created'))
            })
        )

        // 2. create demo
        if (withDemo) {
            const promise = Promise.all([
                list(join(__dirname, 'seed/common/'), ['**/*.*']).then(files => {
                    logger.log('files %j will be copied', true, files)
                    return Promise.all(files.map(file => {
                        read(join(__dirname, 'seed/common/', file)).then(content => {
                            return write(join(targetDir, `common/${file}`), content, true)
                        })
                    }))
                }),
                list(join(__dirname, 'seed/index/'), ['**/*.*']).then(files => {
                    logger.log('files %j will be copied', true, files)
                    return Promise.all(files.map(file => {
                        read(join(__dirname, 'seed/index/', file)).then(content => {
                            return write(join(targetDir, `demo/${file}`), content, true)
                        })
                    }))
                })
            ]).then(() => {
                logger.info('demo created')
            })
            tasks.push(promise)
        }

        return Promise.all(tasks).then(() => {
            console.log()
            logger.zLog('Successfully init sugar develop environment!', true, 'info', true)
            logger.zLog(`all files at "${targetDir}"`)
            return targetDir
        })
    }).then(targetDir => {
        if (withDemo && autorun) {
            console.log()
            logger.zLog('about to auto run development server', true, 'info')
            const args = ['start', 'sugar.config.js']
            if (verbose) {
                args.push('--verbose')
            }
            spawn(`sugar`, args, {
                env: process.env,
                stdio: 'inherit',
                cwd: targetDir
            })
        }
    })
}

function getTargetDir (targetDir) {
    if (!targetDir) {
        logger.warn('target directory unspecified, will use "."')
        targetDir = '.'
    }
    targetDir = resolve(targetDir)

    logger.log(`target directory is ${targetDir}`)

    return extname(targetDir) ? promptTargetDir().then(text => {
        process.stdin.pause()
        if (text === 'yes') {
            return targetDir
        } else if (text === 'no') {
            return dirname(targetDir)
        } else {
            logger.exit(':(', 'will exit', 0)
        }
    }) : Promise.resolve(targetDir)
}

function promptTargetDir () {
    process.stdout.write(
        '\n' + colors.bold('  it seems target directory has extension, do you really want this? (yes/no)')
    )
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    return new Promise((resolve, reject) => {
        process.stdin.on('data', text => {
            resolve(text && text.replace(/\n|\r/g, ''))
        })
    })
}
