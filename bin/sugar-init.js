#!/usr/bin/env node

const {
    join,
    sep
} = require('path')
const exec = require('child_process').exec
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    read,
    write,
    mkdir
} = require('../utils')
const log = require('./logger')('sugar-init')

program
    .option('-S, --no-shared', 'Without default shared part')
    .option('-D, --no-demo', 'Without default demo part')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar init path'.grey)
    })
    .parse(process.argv)

const path = program.args[0]

initEnv(path, program.shared, program.demo)

function initEnv(path, includeShared, includeDemo) {
    if (!path) {
        logHelpInfo(`When init environment, path is required.`, 'Usage: $ sugar init <path> [options]')
        process.exit(0)
    }

    const tasks = []
    let names = path.split(sep)

    if (!names[0]) {
        logHelpInfo(`Maybe path (${path}) is invalid?`, 'We prefer "work"|"front/src" to be path.')
        process.exit(0)
    }
    if (!names[names.length - 1]) {
        names = names.slice(0, -1)
    }
    const envRoot = join(process.cwd(), path)
    path = names[names.length - 1] // now can be used as name

    // 1. write project config file
    tasks.push(
        read(join(__dirname, 'res/sugar.config.js')).then(content => {
            return write(
                join(envRoot, 'sugar.config.js'),
                content,
                true
            ).then(() => log('Config file "sugar.config.js" created.'))
        })
    )
    // 2. create shared
    if (includeShared || includeDemo) {
        const sharedRoot = join(__dirname, 'res/shared')
        const destDir = join(envRoot, 'shared')
        tasks.push(
            mkdir(destDir).then(() => {
                return new Promise((resolve, reject) => {
                    exec(`cp -r ${sharedRoot} ${envRoot}`, (err) => {
                        err ? reject(err) : resolve()
                    })
                }).then(() => log(`Shared directory created.`))
            })
        )
    }

    // 3. create demo
    if (includeDemo) {
        const demoRoot = join(__dirname, 'res/demo')
        const destDir = join(envRoot, 'demo')
        tasks.push(
            mkdir(destDir).then(() => {
                return new Promise((resolve, reject) => {
                    exec(`cp -r ${demoRoot} ${envRoot}`, (err) => {
                        err ? reject(err) : resolve()
                    })
                }).then(() => log(`Demo created.`))
            })
        )
    }

    Promise.all(tasks).then(() => {
        log(`Successfully init develop environment for "${path}"!`)
        process.exit(0)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help init'.grey)
}
