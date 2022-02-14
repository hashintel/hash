# Block template

## Step one: copy this template

See https://blockprotocol.org/docs/developing-blocks

**TL;DR:** Run `npx create-block-app [your-block-name]`

## Step two: write and build a component

1.  Change into the folder: `cd packages/hash/blocks/<name>`

1.  Write a React component starting in `App.tsx`. To test it during development:

    - edit `src/webpack-dev-server.js` to give your component some props to test with
    - run the dev server with `yarn start`

1.  When finished, run `yarn build`, which:

    - Bundles the component, without React, into a single source file
    - Generates a JSON schema from the `AppProps` type representing the data interface with the block
    - Generates a `block-metadata.json` file which:
      - points to the `schema` and `source` files
      - brings in metadata from `package.json`, such as the block name and description
      - additional brings in anything in the `blockprotocol` object in `package.json`, e.g.
        - `displayName`: a friendly display name
        - `examples`: an array of example data structures your block would accept and use
        - `image`: a preview image showing your block in action
        - `icon`: an icon to be associated with your block
      - lists the `externals` - libraries the block expects the host app to provide (React, unless modified)
    - Once uploaded to a remote folder, embedding applications can access `block-metadata.json` to load a block and its schema. This file is documented in full [here](https://blockprotocol.org/spec/block-types).

N.B.

- The JSON schema generation assumes `AppProps` is the name of the type for the entry component's properties. If you change this name, update the `schema` script in `package.json`
- JSON schema offers more [validations](https://json-schema.org/draft/2019-09/json-schema-validation.html) than TypeScript - **TODO** a way of storing these (e.g maxLength) in an extra config file somewhere that doesn't involve manually editing the output schema file each time

## Step three: test your bundled block

You can try out your block in an example embedding application:

1.  Clone the example application, HASH, from [its repository](https://github.com/hashintel/hash/tree/main/packages/hash).

1.  Follow the instructions in its README to set up and run HASH.

1.  In a new terminal, run `yarn serve` in your block's folder). Your block dist is now available at http://localhost:5000.

1.  In the HASH frontend (once signed in), click on the context menu next to any block on a page. Paste http://localhost:5000 into the ‘load block from URL’ input.

1.  Your block should load in its default state. You can now test its functionality, and refresh the page to see how any changes you made persist.

## Step four: publish your block

Head over to [blockprotocol.org](https://blockprotocol.org/docs/developing-blocks#publish) to read instructions on publishing your block.

## External Dependencies

The Block Component is self contained with all of its dependencies bundled with webpack. Any dependencies that will be provided by the embedding app should be marked as `externals` in the `webpack.config.js`, added to `devDependencies` in package.json so they're available during development, and in `peerDependencies` if the component is to be made available as a library for importing via npm.

In this example, `react` is added to `externals` in `webpack.config.js`. It will not be included in the bundle. The version in the embedding application must at least provide the functionality that the block expects the library to have, or else there will be obvious difficulties. **TODO**: Add external library expected versions to `block-metadata.json`

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
- `src/webpack-dev-server.js` - Entrypoint for `yarn dev`. This is only used for development and will not be included in the final bundle.
- `src/index.html` - HTML for `yarn dev`. This is only used for development and will not be included in the final bundle.
- `variants.json` - Defines named presets of block properties to be presented as
  separate or at least related block-types to the end-user.

## Debugging

The component can be debugged locally by first starting `yarn dev`.

```sh
npm run start
```

Now (using VS Code), go to the Debug tab, select "Launch Chrome" and start the debugger (F5).

You should now be able to set breakpoints and step through the code.

---

This template adapted (quite heavily now) from https://github.com/Paciolan/remote-component-starter
