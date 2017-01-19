#!/usr/bin/env node

const { resolve, extname } = require('path')
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
    .option('-w, --watch [files]', 'watch and livereload, support file/dir/glob, like "**/*.{html,css}"')
    .option('--verbose', 'output processing details')
    .on('--help', () => {
        console.log(colors.green('  Examples:'))
        console.log()
        console.log(colors.gray('    $ sugar start configFileUrl --verbose'))
    })
    .parse(process.argv)

const configFileUrl = program.args[0]
const cliConfig = {
    server: {
        host: program.host,
        port: program.port,
        verbose: program.verbose
    },
    extra: {
        disableCache: program.disableCache,
        mergeAssets: program.mergeAssets
    },
    watch: program.watch ? { files: program.watch } : false
}

run(configFileUrl, cliConfig)

function run (configFileUrl, cliConfig) {
    if (cliConfig.server.verbose) {
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
    let specifiedConfig, root
    configFileUrl = resolve(configFileUrl)
    // If no extname, it means configFileUrl is root directory
    if (!extname(configFileUrl)) {
        root = configFileUrl
    }
    const defaultConfig = require('../helper/config.js')
    if (!root && existsSync(configFileUrl)) {
        try {
            specifiedConfig = require(configFileUrl)
        } catch (e) {
            logger.exit(`Error occured when parsing config file`, e.stack.toString(), 1)
        }
    }
    smartMerge(config, defaultConfig, specifiedConfig, cliConfig)
    if (root) {
        config.template.root = root
    }
    logger.log(`config is %j`, true, config)
    return config
}
