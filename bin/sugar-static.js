#!/usr/bin/env node

const { resolve, extname } = require('path')
const colors = require('colors/safe')
const program = require('./command')
const logger = require('./logger')
const serve = require('../server/static/serve')

program
    .option('-a, --host <host>', 'server host, default to "0.0.0.0"')
    .option('-p, --port <port>', 'server port, default to 2333')
    .on('--help', () => {
        console.log(colors.green('  Examples:'))
        console.log()
        console.log(colors.gray('    $ sugar static'))
    })
    .parse(process.argv)

const root = program.args[0]

serveStatic(root, program.host, program.port)

function serveStatic (root, host = '0.0.0.0', port = 2333) {
    if (!root || extname(root)) {
        root = '.'
    }
    root = resolve(root)
    port = +port
    if (Number.isNaN(port) || port < 1024 || port > 65535) {
        logger.exit(`invalid port ${port}`, `port range is [1024, 65535], default is 2333`, 1)
    }
    serve(host, port, root, err => {
        if (err) {
            logger.exit(`Error occured when run static server`, err && err.stack, 1)
        } else {
            console.log()
            logger.zLog(`Successfully start static server!`, true, 'info', true)
            logger.zLog(`address: http://${host}:${port}`)
            logger.zLog(`root: ${root}`)
        }
    })
}
