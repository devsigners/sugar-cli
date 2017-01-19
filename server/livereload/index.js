const chokidar = require('chokidar')
const livereload = require('tiny-lr')
const logger = require('../../helper/logger')

class Reloader {
    constructor ({ port, files, chokidar }) {
        this.port = port || 35729
        this.chokidar = chokidar || {}
        // files support `file, dir, glob, or array`
        if (typeof files === 'string' || Array.isArray(files)) {
            this.files = files
        } else {
            // default watch js and css
            this.files = ['**/*.js', '**/*.css']
        }
        // set ignored files
        if (!this.chokidar.ignored) {
            this.chokidar.ignored = ['**/node_modules/**', '**/bower_components/**']
        }
        logger.info('init, config is %j', 'livereload', this.chokidar)
    }
    start (cb) {
        const server = this.server = livereload()
        logger.info('server created', 'livereload')
        server.listen(this.port, () => {
            logger.info('server started on port: %d', 'livereload', this.port)
            const watcher = this.watcher = chokidar.watch(this.files, this.chokidar)
            watcher.on('all', (event, file) => {
                logger.log('%s has %s', 'livereload', file, event)
                server.changed({
                    body: {
                        files: file
                    }
                })
            })
            cb && cb()
        })

        server.server.removeAllListeners('error')
        server.server.on('error', err => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`port ${this.port} is not available`, 'livereload')
                this.close()
                process.exit(1)
            } else {
                logger.error(err.message + '\n\t' + err.stack, 'livereload')
            }
        })
    }
    close () {
        if (this.server) {
            this.server.close()
        }
        if (this.watcher) {
            this.watcher.close()
        }
    }
}

module.exports = Reloader
