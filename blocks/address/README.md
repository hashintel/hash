# Block template: React

## Step one: copy this template

See https://blockprotocol.org/docs/developing-blocks

**TL;DR:** Run `npx create-block-app@latest [your-block-name]`

Other templates are available. See `npx create-block-app@latest --help`

## Step two: write and build a component

1.  Change into the folder: `cd path/to/your-block-name`

1.  Write a React component starting in `app.tsx`. To test it during development:

    - edit `dev.tsx` to give your block starting properties

    - run the dev server with `yarn dev` (or `npm run dev`)

1.  When finished, run `yarn build` (or `npm run build`), which:

    - Bundles the component, without React, into a single source file
    - Generates a JSON schema from the `BlockEntityProperties` type representing the data interface with the block.
      If your block folder contains `block-schema.json`, this custom schema will be used instead.
    - Generates a `block-metadata.json` file which:
      - points to the `schema` and `source` files
      - brings in metadata from `package.json`, such as the block name and description
      - additional brings in anything in the `blockprotocol` object in `package.json`, e.g.
        - `displayName`: a friendly display name
        - `examples`: an array of example data structures your block would accept and use
        - `image`: a preview image showing your block in action
        - `icon`: an icon to be associated with your block
        - `name`: a slugified name for your block (which may differ to the package `name` in package.json)
      - lists the `externals` - libraries the block expects the host app to provide (React, unless modified)
    - Once uploaded to a remote folder, embedding applications can access `block-metadata.json` to load a block and its schema. This file is documented in full [here](https://blockprotocol.org/docs/spec).

Please see [the Block Protocol docs](https://blockprotocol.org/docs/developing-blocks)
for help in reading and updating data from your block.

Please see [the React docs](https://reactjs.org/docs/getting-started.html) for general help with writing React components.

You can format your code using `yarn format` (or `npm run format`).

N.B.

- The JSON schema generation assumes `BlockEntityProperties` is the name of the type for the entry component's properties.
- JSON schema offers more [validations](https://json-schema.org/draft/2019-09/json-schema-validation.html) than TypeScript.
- If you want to use a custom schema, create `block-schema.json` at the root of your block's folder. This will be used instead of autogenerating one.

## Step three: publish your block

Head over to [blockprotocol.org](https://blockprotocol.org/docs/developing-blocks#publish) to read instructions on publishing your block.

## External Dependencies

The Block Component is self contained with all of its dependencies bundled with webpack. Any dependencies that will be provided by the embedding app should be added to `devDependencies` in package.json so they're available during development, and in `peerDependencies` if the component is to be made available as a library for importing via npm.

In this template, `react` is added to `peerDependencies`. It will not be included in the bundle. The version in the embedding application must at least provide the functionality that the block expects the library to have, or else there will be obvious difficulties.

## Files

There are a few important files, one set is used for the bundle, another set for local development.

- `src/index.ts` - Entrypoint of the Block Component. The component needs to be the `default` export.

## Debugging

The component can be debugged locally by first starting `yarn dev`.

Now (using VS Code), go to the Debug tab, select "Launch Chrome" and start the debugger (F5).

You should now be able to set breakpoints and step through the code.

---

This template was originally adapted from https://github.com/Paciolan/remote-component-starter
