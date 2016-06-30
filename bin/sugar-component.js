#!/usr/bin/env node

const {
    join,
    sep,
    dirname
} = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    statSync,
    exist,
    rm,
    list,
    write,
    toYaml,
    isPlainObject
} = require('../utils')
const log = require('./logger')('sugar-component')

program
    .option('-d, --delete', 'delete component')
    .option('-l, --list', 'list components of current dir')
    .option('-t, --title [title]', 'title for component, default to name')
    .option(
        '-s, --states [states]',
        `syntax like "file,name|file,name", default to "default,默认"`,
        parseList,
        []
    )
    .option('-p, --type [type]', 'one of ["s", "d"], default to "s"')
    .parse(process.argv)

/// handle options
// check name
const name = program.args[0]

if (program.delete) {
    deleteComponent(name)
} else if (program.list) {
    listComponents(name)
} else {
    createComponent(name)
}

function deleteComponent(dir) {
    if (!dir) {
        logHelpInfo(`When delete component, name is required.`, 'Usage: $ sugar component <name> -d')
        process.exit(0)
    }
    let stat = statSync(dir)
    if (!stat || !stat.isDirectory()) {
        log(`"${dir}" is not exist or not directory`.red)
        process.exit(0)
    }

    if (
        !statSync(join(dir, 'component.json'))
        && !statSync(join(dir, 'component.yml'))
        && !statSync(join(dir, 'component.yaml'))
    ) {
        log(`Found no component config file, wont delete it.`.red)
        process.exit(0)
    }
    rm(dir).then(() => {
        log(`Successfully delete component "${dir}"!`)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function listComponents(dir = '') {
    list(join(process.cwd(), dir), [
        '*/component.json',
        '!node_modules/component.json',
        '*/component.yml',
        '!node_modules/component.yml',
        '*/component.yaml',
        '!node_modules/component.yaml'
    ]).then((files) => {
        files = files.map(file => dirname(file))
        if (files.length) {
            log(`Find ${files.length} ${
                files.length > 1 ? 'components' : 'component'
            }:\n\t${files.join('\n\t')}`)
        } else {
            log(`Find no components.`)
        }
    })
}

function createComponent(name) {
    if (!name) {
        logHelpInfo(`When create component, name is required.`, 'Usage: $ sugar component <name> [options]')
        process.exit(0)
    }
    let names = name.split(sep)
    if (!names[0]) {
        logHelpInfo(`Maybe name (${name}) is invalid?`, 'We prefer "component"|"dir/component" to be name.')
        process.exit(0)
    }
    if (!names[names.length - 1]) {
        names = names.slice(0, -1)
    }
    const dirRoot = join(process.cwd(), name)
    name = names[names.length - 1]

    // check states
    let defaultState
    const states = {}
    program.states.forEach((s, i) => {
        const tmp = s.split(',')
        if (i === 0) {
            defaultState = tmp[0]
        }
        states[tmp[0]] = tmp[1]
    })
    if (isPlainObject(states)) {
        states.default = '默认'
        defaultState = 'default'
    }

    const tasks = []
    // 1. write component config file
    tasks.push(write(
        join(dirRoot, 'component.yml'),
        generateComponentConfig(
            program.title || name,
            states,
            program.type,
            defaultState
        ),
        true
    ).then(() => log(`"component.yml" created.`)))

    // 2. create html file for states
    for (const s in states) {
        tasks.push(write(
            join(dirRoot, s + '.html'),
            `<!-- write content [state: ${s}] here -->`,
            true
        ).then(() => log(`"${s}.html" created.`)))
    }

    // TODO: 3. if type is d, create index.html

    Promise.all(tasks).then(() => {
        log(`Successfully create component "${name}"!`)
        process.exit(0)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function generateComponentConfig(title, states, type = 's', defaultState) {
    return toYaml({
        _config: {
            name: title,
            type,
            states,
            defaultState
        }
    })
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help component'.grey)
}

function parseList(arg) {
    return !arg ? [] : arg.toString().split('|')
}
