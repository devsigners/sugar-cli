# directory description

The directory here (`index`) is a container of pages.

For multi-pages project:

- The dir (i.e. `index`) is just a container of pages, which together form a function. Typically we may just have one page.
- The dir also includes other assets (scripts/styles/images) used by pages. And you can put them into a `assets` directory as you like.
- The dir could have sub dirs as many as you like.

However, when the project grows bigger, it's better to split pages into different *projects*, which means `index` dir could be a somehow standalone project. And it can have its own `partials/data/components/...`.
