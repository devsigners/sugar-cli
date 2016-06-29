const path = require('path')

const root = process.cwd()
const staticRoot = path.join(root, 'front/src')

// config for template
const templateConfig = {
    root: staticRoot,
    shared: 'shared',
    isProjectGroup: (dirname) => {
        return ['group'].indexOf(dirname) > -1
    },
    templateExt: '.html',
    // regardless of koa or any other web framework
    error: (err) => {
        console.log('template render error: ', err.stack)
    },
    configFilename: 'project', // automatically try .json, .yml, .yaml

    // Below is config that can be customed by every project,
    // and automatically used by root, which means:
    // pre install global helper:  shared:preInstalledHelpers
    preInstalledHelper: 'preInstalledHelpers',
    helper: 'helpers',
    data: 'data',
    view: '',
    partial: 'partials',
    layout: 'layouts',
    defaultPage: 'index',
    defaultLayout: 'index',
    templateOptions: {}
}

module.exports = {
    template: templateConfig,
    modulesRoot: path.join(root, 'node_modules'),
    staticRoot,
    // build static config items
    buildStatic: {
        // include/exclude html pages with file pattern, like `!myTmpProj/**.html`
        htmlPattern: [],
        dest: path.join(root, 'front/dest'),
        port: 3001
    },
    viewer: {
        source: path.join(root, 'front/viewer'),
        dest: path.join(root, 'front/vdest'),
        // prefix used to set res path
        prefix: 'viewer'
    },
    server: {
        host: '0.0.0.0',
        port: 3000
    }
}
