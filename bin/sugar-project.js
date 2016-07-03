#!/usr/bin/env node

const {
    join,
    sep
} = require('path')
const colors = require('colors') // eslint-disable-line
const program = require('./command')
const {
    read,
    write,
    list,
    statSync,
    rm,
    mkdir,
    toYaml,
    loadConfig
} = require('../utils')
const log = require('./logger')('sugar-project')

program
    .option('-d, --delete', 'delete project')
    .option('-l, --list', 'list projects')
    .option('--config [path]', 'specify config file')
    .option('--cfg.partials [partials]', 'set config.partials, default to "partials"')
    .option('--cfg.helpers [helpers]', 'set config.helpers, default to "helpers"')
    .option('--cfg.data [data]', 'set config.data, default to "data"')
    .option('--cfg.layout [layout]', 'set config.layout, default to "layouts"')
    .option('--cfg.view [view]', 'set config.view, default to ""')
    .option('--cfg.defaultPage [defaultPage]', 'set config.defaultPage, default to "index"')
    .option('--cfg.defaultLayout [defaultLayout]', 'set config.defaultLayout, default to "index"')
    .on('--help', () => {
        console.log('  Examples:'.green)
        console.log()
        console.log('    $ sugar project -l src --config config.js'.grey)
        console.log()
        console.log('  Note:'.green)
        console.log()
        console.log(`    --config only used when list projects.`.grey)
    })
    .parse(process.argv)

const name = program.args[0]

if (program.delete) {
    deleteProject(name)
} else if (program.list) {
    listProjects(name, program.config &&
        loadConfig(join(process.cwd(), program.config), null, true))
} else {
    createProject(name)
}

function deleteProject(dir) {
    if (!dir) {
        logHelpInfo(`When delete project, name is required.`, 'Usage: $ sugar project <name> -d')
        process.exit(0)
    }
    if (!statSync(dir)) {
        logHelpInfo(`Not exist dir "${dir}"`)
        process.exit(0)
    }
    rm(dir).then(() => {
        log(`Successfully delete project "${dir}"!`)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function listProjects(dir = '', cfg) {
    const rootDir = join(process.cwd(), dir)
    let isProjectGroup, projects, group
    if (!cfg) {
        log(`No config file specified, so only list dirs at "${rootDir}"`)
    } else {
        isProjectGroup = cfg.isProjectGroup
        if (!isProjectGroup) {
            log(`config.isProjectGroup is not specified, so wont figure out group.`)
        }
    }
    if (!isProjectGroup) isProjectGroup = () => false

    list(rootDir, ['*/', '!node_modules/', '!shared/']).then((dirs) => {
        // remove trailing slash
        dirs = dirs.map(dir => dir.substring(0, dir.length - 1))
        group = dirs.filter(dir => isProjectGroup(dir))
        projects = dirs.filter(dir => !isProjectGroup(dir))
        if (group.length) {
            return Promise.all(group.map(g => list(rootDir, [g + '/*/'])))
        }
    }).then(groups => {
        if (groups) {
            groups.forEach(groupDirs => {
                projects.push(...(groupDirs.map(dir => dir.substring(0, dir.length - 1))))
            })
        }
        if (projects.length) {
            log(`Find ${projects.length} ${
                projects.length > 1 ? 'projects' : 'project'
            }:\n\t${projects.join('\n\t')}`)
        } else {
            log(`Find no projects.`)
        }
    }).catch(err => log(err.toString(), 'red'))
}

function createProject(name) {
    if (!name) {
        logHelpInfo(`When create project, name is required.`, 'Usage: $ sugar project <name> [options]')
        process.exit(0)
    }

    const cfg = {
        helper: program['cfg.helper'] || 'helpers',
        data: program['cfg.data'] || 'data',
        view: program['cfg.view'] || '',
        partial: program['cfg.partial'] || 'partials',
        layout: program['cfg.layout'] || 'layouts',
        defaultPage: program['cfg.defaultPage'] || 'index',
        defaultLayout: program['cfg.defaultLayout'] || 'index'
    }

    const tasks = []
    let names = name.split(sep)

    if (!names[0]) {
        logHelpInfo(`Maybe name (${name}) is invalid?`, 'We prefer "proj"|"dir/proj" to be name.')
        process.exit(0)
    }
    if (!names[names.length - 1]) {
        names = names.slice(0, -1)
    }
    const projectRoot = join(process.cwd(), name)
    name = names[names.length - 1]
    // 1. write project config file
    tasks.push(write(
        join(projectRoot, 'project.yaml'),
        generateProjectConfig(cfg),
        true
    ).then(() => log('Config file "project.yaml" created.')))

    // 2. create directories
    tasks.push(
        cfg.partial && mkdir(join(projectRoot, cfg.partial))
            .then(() => log(`Dir "${cfg.partial}" created.`)),
        cfg.layout && mkdir(join(projectRoot, cfg.layout))
            .then(() => log(`Dir "${cfg.layout}" created.`)),
        cfg.view && mkdir(join(projectRoot, cfg.view))
            .then(() => log(`Dir "${cfg.view}" created.`)),
        cfg.data && mkdir(join(projectRoot, cfg.data))
            .then(() => log(`Dir "${cfg.data}" created.`)),
        cfg.helper && mkdir(join(projectRoot, cfg.helper))
            .then(() => log(`Dir "${cfg.helper}" created.`)),
        mkdir(join(projectRoot, 'static'))
            .then(() => log(`Dir "static" created.`))
    )

    // 3. create demo html file
    const partialHeader = join(cfg.partial, 'header.html')
    const partialFooter = join(cfg.partial, 'footer.html')
    const layoutFile = join(cfg.layout, cfg.defaultLayout + '.html')
    const homePage = join(cfg.view, cfg.defaultPage + '.html')
    tasks.push(
        read(join(__dirname, 'res/header.html')).then(file => {
            return write(
                join(projectRoot, partialHeader),
                file,
                true
            ).then(() => log(`"${partialHeader}" created.`))
        }),
        read(join(__dirname, 'res/footer.html')).then(file => {
            return write(
                join(projectRoot, partialFooter),
                file,
                true
            ).then(() => log(`"${partialFooter}" created.`))
        }),
        read(join(__dirname, 'res/layout.html')).then(file => {
            return write(
                join(projectRoot, layoutFile),
                file,
                true
            ).then(() => log(`"${layoutFile}" created.`))
        }),
        read(join(__dirname, 'res/homepage.html')).then(file => {
            return write(
                join(projectRoot, homePage),
                file,
                true
            ).then(() => log(`"${homePage}" created.`))
        })
    )

    // 4. css file
    tasks.push(
        read(join(__dirname, 'res/app.css')).then(file => {
            return write(
                join(projectRoot, 'static/css/app.css'),
                file,
                true
            ).then(() => log(`"static/css/app.css" created.`))
        })
    )

    Promise.all(tasks).then(() => {
        log(`Successfully create project "${name}"!`)
        process.exit(0)
    }).catch((err) => {
        log(err.toString(), 'red')
    })
}

function generateProjectConfig(cfg) {
    return toYaml(cfg)
}

function logHelpInfo(info, usage) {
    if (info) log(info, 'red')
    if (usage) log(usage)
    console.log()
    console.log('Run help for details: $ sugar help project'.grey)
}
