# Block Component Starter Kit

![Starter Kit](https://raw.githubusercontent.com/Paciolan/remote-component-starter/master/media/icon-small.png)

Adapted from https://github.com/Paciolan/remote-component-starter

## Getting Started

Copy the folder.

Modify `package.json` and replace the starter kit values with your own.

- set `name` to the name of your project.
- set `description` to describe your project.
- set `repository` to point to your repository.
- set `license` to reflect the license of your project.

## Files

There are a few important files, one set is used for the bundle, another set for local development.

- `src/index.js` - Entrypoint of the Remote Component. The component needs to be the `default` export.
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

## Changing the Output

The bundle as a default will be output to the `dist/main.js`. This can be updated by changing the following two files:

1. `entry` in `webpack-main.config.js`. Update the `main` property to a desired output name.

```javascript
module.exports = {
  ...
  entry: {
    main: "./src/index.js"
  },
  ...
};
```

2.  `url` variable in `src/webpac-dev-server.js`

```javascript
// different paths for localhost vs s3
const url =
  global.location.hostname === "localhost" ? "/dist/main.js" : "main.js";
```

## External Dependencies

The Remote Component is self contained with all of it's dependencies bundled with webpack. Any dependencies that will be provided by the app should be marked as `external` in the `webpack.config.js`.

In this example, `react` and `prop-types` are added to `externals`. They will not be included in the bundle. The web application is expected to provide these dependencies.

```javascript
module.exports = {
  output: {
    libraryTarget: "commonjs"
  },
  externals: {
    react: "react",
    "prop-types": "prop-types"
  }
};
```