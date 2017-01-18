const chokidar = require('chokidar')
const livereload = require('tiny-lr')
const logger = require('../../helper/logger')

class Reloader {
    constructor ({ port, files, chokidar }) {
        this.port = port || 35729
        this.files = files || ['**/*.js', '**/*.css']
        this.chokidar = chokidar || {}
    }
    start (cb) {
        const server = this.server = livereload()
        logger.info('server created', 'livereload')
        server.listen(this.port, () => {
            logger.info('server started on port: %d', 'livereload', this.port)

            const list = this.files
            // default ignore node_modules and bower_components
            list.push('!**/node_modules/**', '!**/bower_components/**')
            const watcher = this.watcher = chokidar.watch(list, this.chokidar)

            logger.info(`start watch files: \n\t${list.join('\n\t')}`, 'livereload')

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
