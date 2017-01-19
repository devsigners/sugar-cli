# sugar-cli [![Build Status](https://travis-ci.org/creeperyang/sugar-cli.svg?branch=master)](https://travis-ci.org/creeperyang/sugar-cli)

> Simple yet powerful tool for prototyping development

`sugar-cli` is a tool with nice features to help build prototypes.

1. support `mustache` like template
2. support use and mix-use `sass/less/postcss`
3. support yaml syntax to specify layout, data file (include **Remote URL**)...
4. powerful development server with simple config
5. support build templates to static files

## Install

[![NPM](https://nodei.co/npm/sugar-cli.png?compact=true)](https://nodei.co/npm/sugar-cli/)

Recommend to install globally: `[sudo] npm i -g sugar-cli@latest`

## Usage

Run `sugar help [command]` for detail info.

1. `sugar init`, init the directory structure with a simple demo. Refer to the demo and you can quickly start.
2. `sugar start`, run a development server, view rendered pages in browser. Support livereload.
3. `sugar build`, build all templates to static htmls.
4. `sugar static`, serve static files.

## License

MIT
