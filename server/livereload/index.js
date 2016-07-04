const chokidar = require('chokidar')
const livereload = require('tiny-lr')
const log = require('debug')('livereload')

class Reloader {
    constructor({
        port,
        files,
        watchOptions
    }) {
        this.port = port || 35729
        this.files = files || ['**/*.js', '**/*.css']
        this.watchOptions = watchOptions || {}
    }
    start(cb) {
        const server = this.server = livereload()
        log('server created')
        server.listen(this.port, () => {
            log('server started on port: %o', this.port)

            const list = this.files
            list.push('!node_modules/**', '!bower_modules/**')
            const watcher = this.watcher = chokidar.watch(list, this.watchOptions)

            log(`start watch files: \n\t${list.join('\n\t')}`)

            watcher.on('all', function(event, file) {
                log('%o has %o', file, event)
                server.changed({
                    body: {
                        files: file
                    }
                })
            })

            cb && cb()
        })

        server.server.removeAllListeners('error')
        server.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                log(`port ${this.port} is not available`)
                server.close()

                if (this.watcher) {
                    this.watcher.close()
                }
                process.exit(1)
            } else {
                log(err.message + '\n\t' + err.stack)
            }
        })
    }
    close() {
        if (this.server) {
            this.server.close()
        }
        if (this.watcher) {
            this.watcher.close()
        }
    }
}

module.exports = Reloader
