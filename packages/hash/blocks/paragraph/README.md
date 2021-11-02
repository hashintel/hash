# Block Component Starter Kit

Block component starter kit. This template adapted (quite heavily now) from https://github.com/Paciolan/remote-component-starter

## Step one: copy this template

Run:

- `yarn new:block <name>` from the root folder of this repo (the `dev` repo)

The template will be copied into `blocks/<name>` and its `package.json` updated with:

- `name` = `<name>`
- `author` = your git name, or omitted if unknown
- `description` = "`<name>` block component`

## Step two: write and build a component

**All commands assume you're in your new block's folder.**

Write a React component starting in `App.tsx`.

Test it during development:

- edit `src/webpack-dev-server.js` to give your component some props to test with
- run the dev server with `yarn start`

When finished, run `yarn build`, which:

- Bundles the component, without React, into a single source file
- Generates a JSON schema from the `AppProps` type representing the data interface with the block
- Generates a `metadata.json` file which:
  - points to the `schema` and `source` files
  - brings in metadata from `package.json`, such as the block name and description
  - lists the `externals` - libraries the block expects the host app to provide (React, unless modified)
- Once uploaded to a remote folder, embedding applications can access `metadata.json` to load a block and its schema.

N.B.

- The JSON schema generation assumes `AppProps` is the name of the type for the entry component's properties. If you change this name, update the `schema` script in `package.json`

## Step three: test your bundled block

1. Run `yarn serve`. Your block dist is now available at http://localhost:5000

2. At the root folder of this repo, run `yarn serve:hash-frontend`.

3. Visit http://localhost:3000/playground and enter http://localhost:5000 as the URL

## External Dependencies

The Block Component is self contained with all of its dependencies bundled with webpack. Any dependencies that will be provided by the embedding app should be marked as `externals` in the `webpack.config.js`, added to `devDependencies` in package.json so they're available during development, and in `peerDependencies` if the component is to be made available as a library for importing via npm.

In this example, `react` is added to `externals` in `webpack.config.js`. It will not be included in the bundle. The version in the embedding application must at least provide the functionality that the block expects the library to have, or else there will be obvious difficulties. **TODO**: Add external library expected versions to `metadata.json`

```javascript
module.exports = {
  externals: {
    react: "react",
  },
};
```

## Files

There are a few important files, one set is used for the bundle, another set for local development.

- `src/index.js` - Entrypoint of the Block Component. The component needs to be the `default` export.
- `src/webpack-dev-server.js` - Entrypoint for `webpack-dev-server`. This is only used for development and will not be included in the final bundle.
- `variants.json` - Defines named presets of block properties to be presented as
  separate or at least related block-types to the end-user.
- `src/index.html` - HTML for `webpack-dev-server`. This is only used for development and will not be included in the final bundle.

## Debugging

The component can be debugged locally by first starting `webpack-dev-server`.

```bash
npm run start
```

Now (using VSCODE), go to the Debug tab, select "Launch Chrome" and start the debugger (F5).

You should now be able to set breakpoints and step through the code.

## TODO

- Upgrade dependencies to latest
