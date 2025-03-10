# Testing

## Overview

The `/tests` directory contains HASH tests which for one reason or another aren't inlined with the code they correspond to (e.g. unit tests). This includes integration tests, load tests, and performance benchmarks. In the future, end-to-end tests will also be stored here.

This `README` additionally includes helpful information about testing in HASH.

## Debugging

While using HASH as an end-user, various parts of the user interface -- specifically designed to help with development and debugging -- are hidden. As a developer, you can display these elements by running the following in your browser console:

```js
localStorage["hash.internal.debugging"] = "true";
```

## Tests

### Backend Integration Tests

Backend integration tests are located in the [`/tests/hash-backend-integration`](/tests/hash-backend-integration) folder.

_The tests require a running instance of `hash-external-services`. see [the root README](/README.md#external-services-test-mode) for information on doing this without polluting the development database._

```sh
yarn test:backend-integration
```

We originally planned to use Playwright [API testing](https://playwright.dev/docs/test-api-testing/) feature instead of Jest (subsequently replaced by Vitest), which would have led to the convergence of `yarn test:backend-integration` and `yarn test:playwright` -- this may still happen.

### Playwright Tests

[Playwright](https://playwright.dev) tests are browser-based integration and end-to-end tests.
The playwright tests are located within the [`/tests/hash-playwright/tests`](/tests/hash-playwright/tests) folder.
To run these tests locally, you will need to have both backend and frontend running.

- _The tests require a running instance of `external-services`. see [the root README](/README.md#external-services-test-mode) for information on doing this without polluting the development database._

#### Terminal 1

```sh
yarn dev:backend
```

#### Terminal 2

```sh
yarn seed-data

## option 1: frontend in dev mode
yarn dev:frontend

## option 2: frontend in prod mode
yarn workspace @apps/hash-frontend build
yarn workspace @apps/hash-frontend start
```

#### Terminal 3

```sh
yarn test:playwright
```

You can add extra arguments to configure how Playwright runs, e.g.:

```sh
yarn test:playwright --headed
```

See `yarn test:playwright --help` for more info.

### Unit Tests

Unit tests are executed by [Vitest](https://vitest.dev/), which we use in place of Jest, due to its improved TS/ESM compatibility. Unit tests are typically colocated alongside the code they cover.

Unit tests can be launched at any time with this command:

```sh
yarn test:unit
```

> _Note: some of the unit tests may output console.error messages. Please disregard these and focus on the pass/fail indicators._
