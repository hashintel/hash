# Block template: React

## Step one: copy this template

See https://blockprotocol.org/docs/blocks/develop

**TL;DR:** Run `npx create-block-app@latest [your-block-name]`

Other templates are available. See `npx create-block-app@latest --help`

## Step two: decide on and build the entity type for your block

A key part of the Block Protocol is the use of types to describe the data your block will work with.

Your block should be associated with an “entity type” which will be used by embedding applications
to understand what sorts of entities can be sent to it (e.g. what properties do they have?).

You can create an entity type on [blockprotocol.org](https://blockprotocol.org) — see [the docs](https://blockprotocol.org/docs/blocks/develop) for a full guide.

Once you have created the type representing the data your block needs, copy its URL for use in the next step.

## Step three: update your block's metadata

1.  Change into the folder: `cd path/to/your-block-name`

1.  Update the `blockprotocol` metadata object in package.json:

- set `blockEntityType` to the URL of the entity type you created in the previous step
- optionally update additional fields which will be used to identify and describe the block when published:
  - `displayName`: a friendly display name
  - `examples`: an array of example data structures your block would accept and use
  - `image`: a preview image showing your block in action (in place of `public/block-preview.png`)
  - `icon`: an icon to be associated with your block (in place of `public/omega.svg`)
  - `name`: a slugified name for your block (which may differ to the package `name` in package.json); it can be defined as `blockname` or `@namespace/blockname`, where `namespace` must be your username on blockprotocol.org if you intend to publish it there
    - this may either be in the format `slug` or `@namespace/slug` where `namespace` is your blockprotocol.org username

1.  Run `yarn codegen` to automatically generate TypeScript types from your block's entity type (you can modify the `codegen` field to generate code for other types as well)

## Step four: write and build your block component

1.  Change into the folder: `cd path/to/your-block-name`

1.  Write a React component starting in `app.tsx`. To test it during development:

    - edit `dev.tsx` to give your block starting properties

    - run the dev server with `yarn dev` (or `npm run dev`)

1.  When finished, run `yarn build` (or `npm run build`), which:

    - Bundles the component into a single source file
    - Generates a `block-metadata.json` file which:
      - brings in metadata from the `blockprotocol` object in `package.json` you set in step 2
      - lists the `externals` - libraries the block expects the host app to provide and won't bundle with itself – based on your stated `peerDependencies` (e.g. `"react"`)

The template uses a helper hook `useEntitySubgraph` to extract the `blockEntity` from the provided `blockEntitySubgraph`.

This hook also returns `linkedEntities`, which are the links and target entities attached to the entity.

Please see [the Block Protocol docs](https://blockprotocol.org/docs/blocks/develop)
for a fuller explanation of querying, creating and updating entity data from your block.

Please see [the React docs](https://reactjs.org/docs/getting-started.html) for general help with writing React components.

You can format your code using `yarn format` (or `npm run format`).

If you want to use environment variables in development, add a `.env` file in this directory, and then you can access variables defined in it via `process.env.VARIABLE_NAME`. This is useful for providing a `blockProtocolApiKey` to `MockBlockDock` in `dev.tsx`.

e.g. your `.env` file might look like this:

```text
BLOCK_PROTOCOL_API_KEY=super-secret
```

and `dev.tsx` like this:

```typescript
  return (
    <MockBlockDock
      blockProtocolApiKey={process.env.BLOCK_PROTOCOL_API_KEY}
```

## Step five: publish your block

Head over to [blockprotocol.org](https://blockprotocol.org/docs/blocks/develop#publish) to read instructions on publishing your block.

## External Dependencies

The Block Component is self-contained with all of its dependencies bundled with webpack. Any dependencies that will be provided by the embedding app should be added to `devDependencies` in `package.json` so they're available during development, and in `peerDependencies` if the component is to be made available as a library for importing via npm.

In this template, `react` is added to `peerDependencies`. It will not be included in the bundle. The version in the embedding application must at least provide the functionality that the block expects the library to have, or else there will be obvious difficulties.

## Debugging

The component can be debugged locally by first starting `yarn dev`.

Now (using VS Code), go to the Debug tab, select "Launch Chrome" and start the debugger (F5).

You should now be able to set breakpoints and step through the code.

---

This template was originally adapted from https://github.com/Paciolan/remote-component-starter
