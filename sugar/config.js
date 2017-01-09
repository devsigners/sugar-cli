module.exports = {
    root: process.cwd(),
    groupPattern: '{group,set}/*',
    templateExt: '.html',
    dataExts: ['.yml', '.yaml', '.json', '.js'],
    configFilename: 'project',

    shared: 'shared',
    helper: 'helpers',
    data: 'data',
    view: '',
    partial: 'partials',
    layout: 'layouts',
    defaultPage: 'index',
    defaultLayout: 'index'
}
