# HASH.dev

## Getting started

In order to run the app in its entirety, you will need to follow these steps:

1. Add the following entry to your `/etc/hosts` file. This is to allow the docker container to reach
   the blocks servers, which are hosted outside the container.
   ```
   127.0.0.1 host.docker.internal
   ```
2. Add the `packages/hash/docker/.env` file (found in the 1Password "HASH.dev/ai" vault with the
   name "HASH.dev backend .env")
3. Run `yarn install`
4. Start the backend and seed the db if necessary (see instructions below)
5. Install the frontend and blocks
6. Start the frontend and blocks

## System requirements

The following programs must be present on your development system:

- A recent version of [Docker](https://docs.docker.com/get-docker/) with BuildKit enabled.
- [Docker Compose](https://docs.docker.com/compose/install/)
- The [Yarn](https://classic.yarnpkg.com/en/docs/install/) v1 package manager

## Start the backend & database

1. Make sure you have the `packages/hash/docker/.env` file present (found in 1Password)
2. Ensure Docker is running.
   If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).
3. Ensure port 5432 is not occupied (i.e. no other postgres service) - You can check with
   `lsof -n -i:5432`
4. If it's your first time, run `docker volume create hash-dev-pg` to create the storage volume.
5. **To start the backend & Postgres Docker container**:
   ```
   yarn serve:hash-backend
   ```
6. **On first run**, or if you want to reset the database to the initial mock data, after starting
   the backend, and having run `yarn install`, run:

   ```
   yarn seed-db
   ```

See the [docker/README](./docker) for further details.

## Start the frontend

Use `yarn serve:hash-frontend` to start the frontend application.

## Integration w/ blockprotocol.org

Block builds are pulled from the URLs configured at `packages/hash/shared/src/blockPaths.json`. Note
that any changes to this file require a rebuild `yarn workspace @hashintel/hash-shared run build`
(use `yarn workspace @hashintel/hash-shared run dev` to watch and rebuild on every change).

By default, `blockPaths.json` point to the `dev` branch's deployment of the blockprotocol.org CDN at
https://blockprotocol-git-dev-hashintel.vercel.app . This can be changed to either a local instance
of blockprotocol.org (see its `/site/README.md` on how to do that) or a webpack-dev-server instance
of a block in development
`yarn workspace @hashintel/block-<block-under-development> run dev --port 3010`.

## Build blocks

In order to build individual blocks, use `yarn build-block:<blockname>`. Use `yarn build-blocks` to
build all blocks concurrently.

## Create a new block bundle from template

1. `yarn new:block <name>`
2. code in `packages/hash/blocks/<name>`

## Tests

Integration tests are located at [packages/hash/integration](./packages/hash/integration). To run
these tests, ensure the API and database are running in test mode (`yarn serve:hash-backend-test`),
which sets a test database name, and execute:

```
yarn test-integration
```

**N.B.** Don't forget to re-start the backend in regular mode (`yarn serve:hash-backend`) for normal
development.

## Code quality

We perform automated linting and formatting checks on pull requests using GitHub Actions. You may
also run these checks using the git hooks provided in [./hooks](./hooks). To install these hooks,
run:

```
yarn install-hooks
```

This installs the hooks into your `.git/hooks` directory as symlinks to the corresponding script in
`./hooks`.

## Monorepo

In order to work w/ multiple packages in a single repository, they must adhere to some conventions.
The below `package.json` file outlines the minimum requirements a package has to fulfill:

```javascript
{
  "name": "@hashintel/hash-<name>",
  "version": "major.minor.patch",
  "description": "lorem ipsum",
  "author": "<package-author>",
  "license": "<package-licence>",
  "scripts": {
    // omit type-checking if not applicable
    "lint": "eslint --ext .ts,.tsx ./src/; tsc --noEmit",
    "fix": "eslint --ext .ts,.tsx --fix ./src/",
    "build": "echo produce artifacts",
    "clean": "echo remove artifacts",
    // required only if this is a shared package
    "postinstall": "yarn build"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "4.29.0",
    "@typescript-eslint/parser": "4.29.0",
    "eslint": "^7.32.0",
    "eslint-config-airbnb": "^18.2.1",
    "eslint-config-prettier": "8.3.0",
    "eslint-plugin-import": "^2.24.2",
    "eslint-plugin-jest": "24.5.0",
    "eslint-plugin-jsx-a11y": "^6.4.1",
    "eslint-plugin-no-restricted-imports": "0.0.0",
    "eslint-plugin-react": "^7.25.1",
    "eslint-plugin-react-hooks": "4.2.0",
    "rimraf": "3.2.0",
    "typescript": "4.3.5"
  }
}
```

The above `devDependencies` are owed to our root eslint-config at `packages/hash/.eslintrc.json`.
That same config requires a `tsconfig.json` next to the `package.json` if `.ts(x)` files are to be
linted.

## Troubleshooting

### Can't log in / not receiving an email

Make sure you have the `.env` file added at `packages/hash/docker/.env`

### eslint `parserOptions.project`

There is a mismatch between VSCode's eslint plugin and the eslint cli tool. Specifically the option
`parserOptions.project` is not interpreted the same way as reported
[here](https://github.com/typescript-eslint/typescript-eslint/issues/251). If VSCode complains about
a file not being "on the project" underlining an import statement, try to add the following to the
plugin's settings:

```json
"eslint.workingDirectories": [
  { "directory": "packages/hash/backend", "!cwd": true }
]
```
