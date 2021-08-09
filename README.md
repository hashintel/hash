# HASH.dev

## Getting started

In order to run the app in its entirety, you will need to follow these steps:
1. Start the backend (and seed the db if necessary)
2. Install the frontend and blocks
3. Start the frontend and blocks

## Start the backend

```
yarn serve:hash-backend
```

On first run, or if you want to reset the database to the initial mock data,
after starting the backend run:

```
yarn seed-db
```

See the [docker/README](./docker) for further details.

## Install the frontend and required remote blocks

`yarn install:demo`

## Start the frontend and required blocks

`yarn demo-sans-backend`

## Create a new block bundle from template

1. `yarn new:block <name>`
2. code in `packages/hash/blocks/<name>`

## Tests

Integration tests are located at [packages/hash/integration](./packages/hash/integration).
To run these tests, ensure the API and database are running
(`yarn serve:hash-backend`) and execute:

```
yarn test-integration
```

## Code quality

We use git hooks to enforce code quality. These hooks are located in the
[hooks/](./hooks) directory. You will need to manually copy these to
`.git/hooks` and enable execution with `chmod u+x .git/hooks/<HOOK NAME>`.

## Monorepo

In order to work w/ multiple packages in a single repository, they must adhere to some conventions.
The below `package.json` file outlines the minimum requirements a package has to fulfill:

```json
{
  "name": "@hashintel/hash-<name>",
  "version": "major.minor.patch",
  "description": "lorem ipsum",
  "author": "<package-author>",
  "license": "<package-licence>",
  "prettier": "@hashintel/prettier-config",
  "scripts": {
    // use script "echo n/a" where not applicable
    "format": "prettier --write './src/**/*'",
    "lint": "prettier --check './src/**/*'; eslint ./src/"
  },
  "devDependencies": {
    "@hashintel/prettier-config": "*",
    "@typescript-eslint/eslint-plugin": "4.29.0",
    "@typescript-eslint/parser": "4.29.0",
    "eslint": "7.32.0",
    "eslint-config-prettier": "8.3.0",
    "prettier": "2.3.2"
  }
}
```

The above `devDependencies` are owed to our root eslint-config at `packages/hash/.eslintrc.json`.
That same config requires a `tsconfig.json` next to the `package.json` if `.ts(x)` files are to
be linted.

## Troubleshooting

### npm-run-all

When running this command you may encounter an error along the lines of

```sh
$ npx npm-run-all -p install:header ...
Watching .../repos/dev and all sub-directories not excluded by your .gitignore. Will not monitor dotfiles.
Found & ignored ./.git/logs ; is listed in .gitignore
Found & ignored ./node_modules ; is listed in .gitignore
```

You will have to downgrade your npm version using `npm i -g npm@6` as described [here](https://github.com/mysticatea/npm-run-all/issues/196#issuecomment-813599087)

### eslint `parserOptions.project`

There is a mismatch between VSCode's eslint plugin and the eslint cli tool. Specifically the option
`parserOptions.project` is not interpreted the same way as reported [here](https://github.com/typescript-eslint/typescript-eslint/issues/251).
If VSCode complains about a file not being "on the project" underlining an import statement, try to
add the following to the plugin's settings:

```json
"eslint.workingDirectories": [
  { "directory": "packages/hash/backend", "!cwd": true }
]
```
