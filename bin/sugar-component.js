#!/usr/bin/env node

const path = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const util = require('../utils')
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
    util.exist(dir).then(() => {
        return util.exist(path.join(dir, 'component.json'))
    }, () => {
        logHelpInfo(`Not exist dir "${dir}"`)
        process.exit(0)
    }).then(() => {
        return util.rm(dir)
    }, () => {
        logHelpInfo(`"${dir}" is not component.`)
        process.exit(0)
    }).then(() => {
        log(`Successfully delete component ${dir}!`)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function listComponents(dir = '') {
    util.list(path.join(process.cwd(), dir), [
        '*/component.json',
        '!node_modules/component.json'
    ]).then((files) => {
        files = files.map(file => file.substring(0, file.length - 15))
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
    let names = name.split(path.sep)
    if (!names[0]) {
        logHelpInfo(`Maybe name (${name}) is invalid?`, 'We prefer "component"|"dir/component" to be name.')
        process.exit(0)
    }
    if (!names[names.length - 1]) {
        names = names.slice(0, -1)
    }
    const dirRoot = path.join(process.cwd(), name)
    name = names[names.length - 1]

    // check states
    let defaultState
    const states = program.states.map((s, i) => {
        const tmp = s.split(',')
        if (i === 0) {
            defaultState = tmp[0]
        }
        return {
            file: tmp[0],
            name: tmp[1]
        }
    }).reduce((pre, cur) => {
        pre[cur.file] = cur
        return pre
    }, {})
    if (util.isPlainObject(states)) {
        states.default = {
            file: 'default',
            name: '默认'
        }
        defaultState = 'default'
    }

    const tasks = []
    // 1. write component config file
    tasks.push(util.write(
        path.join(dirRoot, 'component.json'),
        generateComponentConfig(
            program.title || name,
            states,
            program.type,
            defaultState
        ),
        true
    ).then(() => log('component.json created.')))

    // 2. create html file for states
    for (const s in states) {
        tasks.push(util.write(
            path.join(dirRoot, states[s].file + '.html'),
            `<!-- __component_key__={{__c_${name}__._key}} -->`,
            true
        ).then(() => log(states[s].file + '.html created.')))
    }

    // TODO: 3. if type is d, create index.html

    Promise.all(tasks).then(() => {
        log(`Successfully create component ${name}!`)
        process.exit(0)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function generateComponentConfig(title, states, type = 's', defaultState) {
    return JSON.stringify({
        name: title,
        type,
        states,
        _state: defaultState
    }, null, '\t')
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
