# Block Component Starter Kit

Block component starter kit. When built with `yarn build`:
- Bundles the component without React
- Generates a JSON schema for AppProps (dist/schema.json), representing the interface with the block
- Resulting `main.js` can be loaded into an embedding application at runtime using https://github.com/Paciolan/remote-component - although this appears to depend on defining files in the embedding application, so we need to build a different solution.

Adapted from https://github.com/Paciolan/remote-component-starter

## TODO

- Upgrade dependencies
- Further strip away unnecessary config
- Figure out how to build a version of https://github.com/Paciolan/remote-component that doesn't need the embedding application to define anything. How that library works:
  - it depends on building the `requires` to pass to [this remote module loader](https://github.com/Paciolan/remote-module-loader/blob/master/src/lib/loadRemoteModule.ts)
  - Requires is built in the wrapping library [here](https://github.com/Paciolan/remote-component/blob/master/src/components/RemoteComponent.ts)
  - The `remote-component.config.js` file here in the block component repo is what needs to be translated into the embedding application - is this only necessary to get the dependencies installed in the embedder? Or is it important for loading the component? If the latter, we need a way of serving this file alongside the bundle, for injecting dependencies at runtime. If it's only to do with specitying what dependencies must exist, we can leave that to embedding applications - e.g. specify this component requires React.

## Getting Started

Run:
- `yarn new:block <name>` from the root folder of this repo (the `dev` repo)
- `node create-block <name>` from the `blocks` folder

The template will be copied into `blocks/<name>` and its `package.json` updated with:
- `name` = `<name>`
- `author` = your git name, or omitted if unknown
- `description` = "`<name>` block component`

## Files

There are a few important files, one set is used for the bundle, another set for local development.

- `src/index.js` - Entrypoint of the Block Component. The component needs to be the `default` export.
- `src/webpack-dev-server.js` - Entrypoint for `webpack-dev-server`. This is only used for development and will not be included in the final bundle.
- `src/index.html` - HTML for `webpack-dev-server`. This is only used for development and will not be included in the final bundle.

## Building

The bundle will be output to the `dist/main.js`.

```bash
npm run build
```

Create a development build for easier debugging.

```bash
npm run build:dev
```

## Debugging

The component can be debugged locally by first starting `webpack-dev-server`.

```bash
npm run start
```

Now (using VSCODE), go to the Debug tab, select "Launch Chrome" and start the debugger (F5).

You should now be able to set breakpoints and step through the code.

## External Dependencies

The Block Component is self contained with all of its dependencies bundled with webpack. Any dependencies that will be provided by the embedding app should be marked as `external` in the `webpack.config.js`.

In this example, `react` is added to `externals`. They will not be included in the bundle. The embedding application is expected to provide these dependencies.

```javascript
module.exports = {
  externals: {
    react: "react",
  }
};
```