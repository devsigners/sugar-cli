const {
    join
} = require('path')

const root = __dirname

// template setting
const templateConfig = {
    root,
    shared: 'shared',
    isProjectGroup: (dirname) => {
        return dirname.startsWith('group')
    },
    templateExt: '.html',
    configFilename: 'project', // automatically try .json, .yml, .yaml
    disableCache: true, // default disable cache

    helper: 'helpers',
    data: 'data',
    view: '',
    partial: 'partials',
    layout: 'layouts',
    defaultPage: 'index',
    defaultLayout: 'index'
}

// build setting
const buildConfig = {
    // include/exclude html pages with file pattern, like `!myTmpProj/**.html`
    htmlPattern: [],
    dest: join(root, 'dest')
}

// server setting
const serverConfig = {
    host: '0.0.0.0',
    port: 3000
}

module.exports = {
    template: templateConfig,
    build: buildConfig,
    server: serverConfig
}
