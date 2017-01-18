#!/usr/bin/env node

const colors = require('colors/safe')
const pkg = require('../package.json')
const program = require('./command')

program.version(pkg.version)

program
    .command('init [dir]', 'init sugar develop environment')
    .command('start <configFileUrl>', 'run develop server')
    .command('static [dir]', 'serve static files')
    .command('build [configFileUrl]', 'transform templates to static htmls')

program.on('--help', () => {
    console.log(colors.green('  Examples:'))
    console.log('')
    console.log(colors.gray('    $ sugar start sugar.config.js --watch'))
    console.log(colors.gray('    $ sugar init mydir --autorun'))
    console.log(colors.gray('    $ sugar static . --port 3333'))
    console.log('')
    console.log('')
    console.log(colors.green(`  ★★★★★  ${
        typeof pkg.author === 'string' ? pkg.author : pkg.author.name
    } ${pkg.name}@v${pkg.version}  ★★★★★`))
})

program.parse(process.argv)

if (program.rawArgs.length === 2) {
    console.log(colors.green(`  ★★★★★  ${pkg.name}@v${pkg.version}  ★★★★★`))
    process.exit(0)
}
