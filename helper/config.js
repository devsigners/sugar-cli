const { resolve } = require('path')

// template config
const templateConfig = {
    root: process.cwd(),
    groupPattern: '{group,set}/*',
    templateExt: '.html',
    dataExts: ['.yml', '.yaml', '.json', '.js'],
    configFilename: 'project',

    shared: 'common',
    helper: 'helpers',
    data: 'data',
    view: '',
    partial: 'components',
    layout: 'layouts',
    defaultPage: 'index',
    defaultLayout: 'index'
}

// build config
const buildConfig = {
    // Array of patterns, used to include/exclude html pages,
    // such as `[**/*.html, !myTmpProj/**.html]`
    htmls: [],
    dest: resolve('dest'),
    ignoreBuiltinPatterns: false,
    assets: true
}

// server config
const serverConfig = {
    host: '0.0.0.0',
    port: 3000
}

module.exports = {
    template: templateConfig,
    build: buildConfig,
    server: serverConfig
}
