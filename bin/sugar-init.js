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
    mkdir,
    statSync
} = require('../utils')
const log = require('./logger')('sugar-init')

program
    .option('-S, --no-shared', 'Without default shared part')
    .option('-D, --no-demo', 'Without default demo part')
    .option('-c, --config [path]', 'Specify config file')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar init dir'.grey)
    })
    .parse(process.argv)

const name = program.args[0]

initEnv(name, program.config, program.shared, program.demo)

function initEnv(name, configFileUrl, includeShared, includeDemo) {
    if (!name) {
        logHelpInfo(`When init environment, name is required.`, 'Usage: $ sugar init <name> [options]')
        process.exit(0)
    }



    const tasks = []
    let names = name.split(sep)

    if (!names[0]) {
        logHelpInfo(`Maybe name (${name}) is invalid?`, 'We prefer "work"|"front/src" to be name.')
        process.exit(0)
    }
    if (!names[names.length - 1]) {
        names = names.slice(0, -1)
    }
    const envRoot = join(process.cwd(), name)
    name = names[names.length - 1]

    // 1. get config file
    let config
    if (configFileUrl) {
        if (!statSync(configFileUrl)) {
            logHelpInfo(`Config file (${configFileUrl}) not found. Will exit.`)
            process.exit(0)
        }
        config = require(configFileUrl)
        tasks.push(read(configFileUrl))
    } else {
        config = require('../sugar.config.js')
        tasks.push(read(join(__dirname, '../sugar.config.js')))
    }

    // 2. write project config file
    tasks[0].then(content => {
        write(
            join(envRoot, 'sugar.config.js'),
            content,
            true
        ).then(() => log('Config file "sugar.config.js" created.'))
    })
    // 3. create shared
    if (includeShared || includeDemo) {
        const templateConfig = config.template
        const sharedDir = join(envRoot, config.template.shared)
        const sharedTasks = []
        sharedTasks.push(
            templateConfig.partial && mkdir(join(sharedDir, templateConfig.partial)),
            templateConfig.layout && mkdir(join(sharedDir, templateConfig.layout)),
            templateConfig.data && mkdir(join(sharedDir, templateConfig.data)),
            templateConfig.helper && mkdir(join(sharedDir, templateConfig.helper)),
            mkdir(join(sharedDir, 'static'))
        )
        tasks.push(Promise.all(sharedTasks).then(() => log(`Shared part created.`)))
    }

    // 4. create demo
    if (includeDemo) {
        const demoRoot = join(__dirname, '../front/src/demo')
        const destDir = join(envRoot, 'demo')
        tasks.push(
            new Promise((resolve, reject) => {
                exec(`cp -r ${demoRoot} ${destDir}`, (err) => {
                    err ? reject(err) : resolve()
                })
            }).then(() => log(`Demo part created.`))
        )
    }

    Promise.all(tasks).then(() => {
        log(`Successfully init environment "${name}"!`)
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
