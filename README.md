# sugar-cli

> 简单但强大的原型开发（帮助）工具

原型开发是前端开发中比较特殊的，偏重于HTML和CSS。传统的纯静态页开发缺少灵活性和可复用性；而借助后端模板（PHP/Java等）的话，依赖复杂，对前端不够友好。`sugar-cli`基于`Node.js`，通过自定义的模板和简洁的配置，就可以高效地开发原型（prototyping）。

`sugar-cli`的特性：

1. 类似`mustache`的模板语法，支持 helpers（参考`handlebars`）和 partials/components。
2. 原生支持使用／混用`sass/less/postcss`，无需配置，自动编译。
3. 支持在html头部写 yaml 配置，指定 layout，data等。data支持指定remote url，自动获取API数据。
4. 强大的开发服务器，支持输出详细日志，支持livereload。

## Install

[![NPM](https://nodei.co/npm/sugar-cli.png?compact=true)](https://nodei.co/npm/sugar-cli/)

推荐全局安装: `[sudo] npm i -g sugar-cli@latest`

## Usage

可以通过`sugar help [command]`来获取帮助信息。

1. `sugar init`初始化带demo的开发环境，可以快速开始开发。
2. `sugar start`启动开发服务器，支持livereload，边开发边浏览器预览。
3. `sugar build`将模板编译到静态文件。
4. `sugar static`一个独立的纯静态服务器。

## License

MIT
