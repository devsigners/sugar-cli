#!/usr/bin/env node

const {
    join,
    extname
} = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const log = require('./logger')('sugar-static')

program
    .option('--host [host]', 'Static server host, default to "0.0.0.0"')
    .option('--port [port]', 'Static server port, default to 3003')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar static'.grey)
    })
    .parse(process.argv)

const dir = program.args[0]

serveStatic(dir, program.host, program.port)

function serveStatic(dir, host = '0.0.0.0', port = 3003) {
    if (!dir || extname(dir)) {
        dir = '.'
    }
    dir = join(process.cwd(), dir)
    port = +port
    if (Number.isNaN(port) || port < 1024 || port > 65535) {
        log(`Invalid port ${port}`, 'red')
        log(`Port range: [1024, 65535], default is 3003`)
        process.exit(0)
    }
    require('../server/static/pureStatic')(host, port, dir, (err) => {
        if (err) {
            log('Failed to run static server', 'red')
            log(err.stack, 'red')
        } else {
            log(`Server is running at http://${host}:${port}`, 'gray')
            log('Serve static at ' + dir, 'gray')
        }
    })
}
