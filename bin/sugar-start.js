#!/usr/bin/env node

const {
    join,
    isAbsolute
} = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    merge
} = require('../utils')
const log = require('./logger')('sugar-dev-server')

program
    .option('-s, --silent', 'Do not log message except error info')
    .option('-w, --watch', 'Enable watch and livereload')
    .option('--watch-files <files>', 'Specify watch files with glob, like "**/*.html,**/*.css"')
    .option('--watch-port <port>', 'Specify livereload server port, default is 35729', parseInt)
    .option('--no-mergecss', 'Specify livereload server port', parseInt)
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar start [configFileUrl]'.grey)
    })
    .parse(process.argv)

const configFileUrl = program.args[0]

run(configFileUrl, program.silent, {
    watch: program.watch,
    files: program.watchFiles ? program.watchFiles.split(',') : ['**/*.css', '**/*.js', '**/*.html'],
    port: program.watchPort
}, {
    autoMergeCss: program.mergecss
})

function run(configFileUrl, silent, watch, setting) {
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
        process.env.DEBUG = 'sugar-template,sugar-server,livereload'
    }

    if (watch.watch) {
        config.watch = watch
    }
    require(join(__dirname, '../server'))(config, setting)
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help start'.grey)
}
