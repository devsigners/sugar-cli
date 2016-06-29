#!/usr/bin/env node

const {
    join,
    sep,
    isAbsolute
} = require('path')
const exec = require('child_process').exec
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    merge
} = require('../utils')
const log = require('./logger')('sugar-dev-server')

program
    .option('-s, --silent', 'Do not log message except error info')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar start configFileUrl'.grey)
    })
    .parse(process.argv)

const configFileUrl = program.args[0]

run(configFileUrl)

function run(configFileUrl, silent) {
    if (!configFileUrl) {
        logHelpInfo(`When run develop server, configFileUrl is required.`, 'Usage: $ sugar start <configFileUrl> [options]')
        process.exit(0)
    }

    const config = {}
    try {
        configFileUrl = isAbsolute(configFileUrl) ? configFileUrl : join(process.cwd(), configFileUrl)
        merge(config, require(join(__dirname, 'res/sugar.config.js')), require(configFileUrl))
    } catch (e) {
        log(`Can not process config correctly.`, 'red')
        log(`Maybe ${configFileUrl} is invalid.`, 'red')
        console.error(e)
        process.exit(0)
    }

    if (!silent) {
        process.env.DEBUG = 'sugar-template,sugar-server'
    }
    require(join(__dirname, '../server/cliAdapter.js'))(config)
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help start'.grey)
}
