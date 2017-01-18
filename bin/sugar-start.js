#!/usr/bin/env node

const { resolve } = require('path')
const colors = require('colors/safe')
const program = require('./command')
const { smartMerge } = require('../helper/utils')
const { existsSync } = require('../helper/fs')
const logger = require('./logger')

program
    .option('--host <host>', 'server host, default is 0.0.0.0')
    .option('--port <port>', 'server port, default is 3000', port => Number(port))
    .option('--disable-cache', 'disable server cache')
    .option('--merge-assets', 'auto merge css and js code')
    .option('-w, --watch [files]', 'watch and livereload, ')
    .option('--verbose', 'output processing details')
    .on('--help', () => {
        console.log(colors.green('  Examples:'))
        console.log()
        console.log(colors.gray('    $ sugar start configFileUrl --verbose'))
    })
    .parse(process.argv)

const configFileUrl = program.args[0]

run(configFileUrl, program.verbose, {
    server: {
        host: program.host,
        port: program.port
    },
    template: {
        extra: {
            disableCache: program.disableCache,
            mergeAssets: program.mergeAssets
        }
    }
})

function run(configFileUrl, verbose, cliConfig) {
    if (verbose) {
        process.env.LOGLEVEL = 0
        logger.level = 0
    } else {
        process.env.LOGLEVEL = 5
        logger.level = 5
    }

    const config = getConfig(configFileUrl, cliConfig)
    console.log()
    console.log(
        colors.green(colors.bold('  Successfully start sugar server!'))
    )
    console.log()
    require('../server')(config)
}

function getConfig (configFileUrl, cliConfig) {
    // Check configFileUrl.
    if (!configFileUrl) {
        configFileUrl = 'sugar.config.js'
        logger.warn(`configFileUrl unspecified, will use "sugar.config.js"`)
    }

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
        smartMerge(config, defaultConfig, specifiedConfig, cliConfig)
        logger.log(`config is %j`, true, config)
    } catch (e) {
        logger.exit(`Error occured when get config info`, e.stack.toString(), 1)
    }

    return config
}
