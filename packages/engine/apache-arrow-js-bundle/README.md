# Apache-Arrow bundler

## Usage

### Building

Run

- `yarn install`
- `yarn workspace @hashengine/apache-arrow-js-bundle bundle`

The bundle should appear as `./dist/apache-arrow-bundle.js`

### Copying into the Engine

- Manually modify the bundle, adding `return arrow` underneath `arrow = __webpack_exports__;` at the very bottom of the file
- From the `./packages/engine` folder run:
  `cp apache-arrow-js-bundle/dist/apache-arrow-bundle.js src/worker/runner/javascript/apache-arrow-bundle.js`

> Unfortunately at this time we haven't figured out how to generate the exact format we need for the way we load scripts into V8 (through `eval`ing).
> This is why we require the bundle to be manually modified.
> Due to using `eval` we need the module to be the return result of the file, rather than a normal module that you can import.
>
> If anyone has ideas on how to resolve this, suggestions are welcome.
