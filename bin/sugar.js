#!/usr/bin/env node

const colors = require('colors') // eslint-disable-line
const pkg = require('../package.json')
const program = require('./command')

const exitCli = (code = 0) => {
    process.exit(code)
}

program.version(pkg.version)

program
    .command('component <name>', 'Create, delete, list component')
    .command('project <name>', 'Create, delete, list project')

program.on('--help', () => {
    console.log('  Examples:'.green)
    console.log('')
    console.log('    $ sugar component passenger -t 乘客 -p s'.grey)
    console.log('')
    console.log('')
    console.log(`★★★★★  ${pkg.author} ${pkg.name}@v${pkg.version}  ★★★★★`.green)
})

program.parse(process.argv)

if (program.rawArgs.length === 2) {
    console.log(`★★★★★  ${pkg.name}@v${pkg.version}  ★★★★★`.green)
    exitCli()
}
