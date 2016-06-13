const path = require('path')
const colors = require('colors')

function colored(text, color = 'black') {
    return colors[color](text)
}

exports = module.exports = (name) => {
    const prefix = colored(name, 'green')
    return (text, color = 'gray') => {
        console.log(`${prefix} ${colored(text, color)}`)
    }
}
