const {
    join
} = require('path')

const root = __dirname

// config for template
const templateConfig = {
    root,
    shared: 'shared',
    isProjectGroup: (dirname) => {
        return dirname.startsWith('group')
    },
    templateExt: '.html',
    configFilename: 'project', // automatically try .json, .yml, .yaml

    helper: 'helpers',
    data: 'data',
    view: '',
    partial: 'partials',
    layout: 'layouts',
    defaultPage: 'index',
    defaultLayout: 'index'
}

module.exports = {
    template: templateConfig,
    build: {
        // include/exclude html pages with file pattern, like `!myTmpProj/**.html`
        htmlPattern: [],
        dest: join(root, 'dest'),
        port: 3001
    },
    server: {
        host: '0.0.0.0',
        port: 3000
    }
}
