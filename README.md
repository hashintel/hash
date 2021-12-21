# HASH.dev

## Getting started

In order to run the app in its entirety, you will need to follow these steps:

1.  Add the following entry to your `/etc/hosts` file. This is to allow the docker container to reach
    the blocks servers, which are hosted outside the container.

    ```txt
    127.0.0.1 host.docker.internal
    ```

1.  Add the `packages/hash/docker/.env` file (found in the 1Password "HASH.dev/ai" vault with the
    name "HASH.dev backend .env")
1.  Run `yarn install`
1.  Start the backend and seed the db if necessary (see instructions below)
1.  Install the frontend and blocks
1.  Start the frontend and blocks

## System requirements

The following programs must be present on your development system:

- A recent version of [Docker](https://docs.docker.com/get-docker/) with BuildKit enabled.
- [Docker Compose](https://docs.docker.com/compose/install/)
- The [Yarn](https://classic.yarnpkg.com/en/docs/install/) v1 package manager

## Start the backend & database

1.  Make sure you have the `packages/hash/docker/.env` file present (found in 1Password)
1.  Ensure Docker is running.
    If you use Docker for macOS or Windows, go to _Preferences_ → _Resources_ and ensure that Docker can use at least 4GB of RAM (8GB is recommended).
1.  Ensure port 5432 is not occupied (i.e. no other postgres service) - You can check with
    `lsof -n -i:5432`
1.  If it's your first time, run `docker volume create hash-dev-pg` to create the storage volume.
1.  **To start the backend & Postgres Docker container**:

    ```sh
    yarn serve:hash-backend
    ```

1.  **On first run**, or if you want to reset the database to the initial mock data, after starting
    the backend, and having run `yarn install`, run:

    ```sh
    yarn seed-db
    ```

Our login and signup flows rely on emails with links or authentication codes.
By default, the API server uses `DummyEmailTransporter` which simulates email sending for local development and testing.
You will find authentication codes in `var/api/dummy-email-transporter/email-dumps.yml` and in the CLI output.

To use `AwsSesEmailTransporter` instead, set `export HASH_EMAIL_TRANSPORTER=aws_ses`.
Note that you will need valid credentials for this email transporter to work.

See the [docker/README](./docker) for further details.

## Start the frontend

Use `yarn serve:hash-frontend` to start the frontend application.

## Integration w/ blockprotocol.org

By default, `packages/hash/shared/src/blockPaths.json` point to the `dev` branch’s deployment of the blockprotocol.org CDN at https://blockprotocol-git-dev-hashintel.vercel.app.
This can be changed to either a local instance of blockprotocol.org (see its `/site/README.md` on how to do that) or a webpack-dev-server instance of a block in development `yarn workspace @hashintel/block-<block-under-development> run dev --port 3010`.

When referring to local blocks in `blockPaths.json`, please note that you need to use `http://host.docker.internal:PORT` instead of `http://localhost:PORT`.
You also need to make sure that your `/etc/hosts` file is configured (see [Getting started](#getting-started) section).

## Build blocks

In order to build individual blocks, use `yarn build-block:<blockname>`. Use `yarn build-blocks` to
build all blocks concurrently.

## Create a new block bundle from template

1.  `yarn new:block <name>`
1.  code in `packages/hash/blocks/<name>`

## Testing

### Backend integration tests

Backend integration tests are located at [packages/hash/integration](./packages/hash/integration). To run
these tests, ensure the API and database are running in test mode (`yarn serve:hash-backend-test`),
which sets a test database name, and execute:

```sh
yarn test:backend-integration
```

**N.B.** Don't forget to re-start the backend in regular mode (`yarn serve:hash-backend`) for normal
development.

### Playwright tests

[Playwright](https://playwright.dev) tests are browser-based integration and end-to-end tests.
They apply to the monorepo as a whole, so are located in the top-level [tests](./tests) folder.
To run these tests locally, you will need to have both backend and frontend running.

To ensure that your local changes are unaffected by the tests, it is recommended to use another database instance (`HASH_PG_DATABASE=integration_tests`).
The database needs to be re-seeded before each test run.

If you run a local instance of the app, please stop it before running the tests to free network ports.

#### Terminal 1

```sh
yarn rebuild:backend
HASH_PG_DATABASE=integration_tests yarn serve:hash-backend
```

#### Terminal 2

```sh
HASH_PG_DATABASE=integration_tests yarn seed-db

## option 1: frontend in dev mode
yarn serve:hash-frontend

## option 2: frontend in prod mode
yarn workspace @hashintel/hash-frontend build
yarn workspace @hashintel/hash-frontend start
```

#### Terminal 3

```sh
yarn test:playwright
```

You can add extra arguments to configure how Playwright runs, e.g.:

```sh
yarn test:playwright --headed --workers=1
```

See `yarn test:playwright --help` for more info.

### Unit tests

Unit tests are executed by [Jest](https://jestjs.io) and use [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) to cover the UI.
They can be launched at any time with this command:

```sh
yarn test:unit
```

Going forward, consider using Playwright if you want to test the UI.
Your tests will be less wired to the implementation details and thus be closer to what real users see and do.

## Code quality

We perform automated linting and formatting checks on pull requests using GitHub Actions. You may
also run these checks using the git hooks provided in [./hooks](./hooks). To install these hooks,
run:

```sh
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
    "fix:eslint": "eslint --ext .ts,.tsx --fix ./src/",
    "lint:eslint": "eslint --ext .ts,.tsx ./src/",
    "lint:tsc": "tsc --noEmit",
    "build": "echo produce artifacts",
    "clean": "echo remove artifacts",
    // required only if this is a shared package
    "postinstall": "yarn build"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "5.6.0",
    "@typescript-eslint/parser": "5.6.0",
    "eslint": "^7.32.0",
    "eslint-config-airbnb": "^18.2.1",
    "eslint-config-prettier": "8.3.0",
    "eslint-plugin-import": "^2.24.2",
    "eslint-plugin-jest": "25.3.0",
    "eslint-plugin-jsx-a11y": "^6.4.1",
    "eslint-plugin-no-restricted-imports": "0.0.0",
    "eslint-plugin-react": "^7.25.1",
    "eslint-plugin-react-hooks": "4.2.0",
    "rimraf": "3.2.0",
    "typescript": "4.5.2"
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
  { "directory": "packages/hash/api", "!cwd": true }
]
```

### ECONNREFUSED: Refused to connect to your block

The backend Docker instance may not be able to reach your locally hosted block. In that case, you can use [Cloudflare Tunnels](https://developers.cloudflare.com/pages/how-to/preview-with-cloudflare-tunnel) to serve your localhost port via a URL, and use that in `blockPaths.json`.

### API server: request to http://localhost:\*/metadata.json failed, reason: connect ECONNREFUSED 127.0.0.1:\*

The collab server (which is a part of the API container) fails to reach a locally developed block.
You can fix it by replacing `localhost` with `host.docker.internal` in `blockPaths.json`.

Check [Integration w/ blockprotocol.org](#integration-w-blockprotocolorg) section for details.
