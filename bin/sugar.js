#!/usr/bin/env node

const colors = require('colors') // eslint-disable-line
const pkg = require('../package.json')
const program = require('./command')

const exitCli = (code = 0) => {
    process.exit(code)
}

program.version(pkg.version)

program
    .command('init <path>', 'Init sugar develop environment')
    .command('component <name>', 'Create, delete, list component')
    .command('project <name>', 'Create, delete, list project')
    .command('start <config>', 'Run develop server')
    .command('static', 'Run a pure static server')
    .command('build <config>', 'Build project')

program.on('--help', () => {
    console.log('  Examples:'.green)
    console.log('')
    console.log('    $ sugar start sugar.config.js --watch'.grey)
    console.log('    $ sugar init uiDir'.grey)
    console.log('    $ sugar static . --port 3333'.grey)
    console.log('')
    console.log('')
    console.log(`★★★★★  ${
        typeof pkg.author === 'string' ? pkg.author : pkg.author.name
    } ${pkg.name}@v${pkg.version}  ★★★★★`.green)
})

program.parse(process.argv)

if (program.rawArgs.length === 2) {
    console.log(`★★★★★  ${pkg.name}@v${pkg.version}  ★★★★★`.green)
    exitCli()
}
