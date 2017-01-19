const test = require('ava')
const { resolve } = require('path')
const { readFileSync } = require('fs')
const Sugar = require('../sugar/core')

const core = new Sugar()

const config = require('../helper/config').template
config.root = resolve('bin/seed')
process.env.LOGLEVEL = 5

test('should correctly render template', t => {
    return core.render(resolve(config.root, 'index/index.html'), {
        data: {},
        config,
        directory: 'index'
    }).then(html => {
        const expected = readFileSync(resolve('test/expected/index.html')).toString('utf8')
        t.is(html, expected)
    })
})
