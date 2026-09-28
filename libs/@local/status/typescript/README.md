# HASH Status and Error Model

## Goals

A consistent structure and pattern for producing API-agnostic definitions of statuses and errors.

- Services should be able to understand and handle error conditions of other services' responses
- Developers should be able to write errors within a framework and re-use structures and code

## Guidelines

- Every service produces a well-defined description of its API, where the API responses are mappable to `Status` objects
  - This mapping should be re-usable, and consistent for all usages of the protocol rather than being bespoke for the service, i.e. all HTTP responses should be mapped into `Status` objects the same way.
- When attaching information to a response that _will cross an API boundary **between services**,_ the information should be encapsulated in a strongly typed object that is included in the definition of the API.
  - Developers should _default_ to using a payload definition from the `@local/status` package, only creating new payloads when required for their domain. (And at that point a consideration should be made if the new payload should be hoisted to the `@local/status` package or if it’s too domain specific).
- When crossing the boundary of service to client, the `Status` should be consumed, and translated into a user-facing appropriate message.

  [How to Write Helpful Error Messages to Improve Your App's User Experience](https://www.freecodecamp.org/news/how-to-write-helpful-error-messages-to-improve-your-apps-ux/)

- The propagation of errors purely _within_ a service do not have to conform to the shape of the model defined here. This is a compromise to attempt to maintain idiomatic behaviour within various environments. Therefore `error-stack` can continue to be used consistently in Rust, and TS can throw errors that will be caught in a tight scope when required. However, once a path allows for that error to be propagated through an API, type systems should be used to ensure that all errors in there are defined in a publicly consumable fashion.

## Usage

### Importing the dependency

This package is exposed as a Rust crate and as an npm package. Services in those languages should add the respective
distribution as a dependency and use the `Status` and `StatusCode` types.

### Exposing definitions

Every service that exposes an API should provide a set of 'payload' definitions for the `Status` objects they return.
They can do this by doing the following:

- Create a `./type-defs/status-payloads.ts` file that **only** contains `exports` statements for the `type`s of payloads that are used by the service.
  - Services can, and should, re-export shared payload definitions that they consume from other places **and then expose through their API**, e.g.

    ```ts
    // some-service-workspace/typedefs/status-payloads.ts
    export {
      ErrorInfo,
      RequestInfo,
      ResourceInfo,
    } from "@local/status/type-defs/status-payloads";
    export type MyServiceSpecificPayload = {
      // ...
    };
    ```

- Expose the `type-defs` folder through the `package.json`.
  This can be done as follows:

  ```json5
  {
    // package.json
    exports: {
      "./type-defs/*": {
        types: "./type-defs/*.ts",
        default: "./type-defs/*.ts",
        node: "./type-defs/*.ts",
      },
    },
  }
  ```

- JS/TS services then use the payloads by importing the TypeScript definitions via relative paths.

## Package Layout

This package is structured into two main areas:

- [`rust`](./rust) contains the Rust crate that defines the `Status` and `StatusCode` types.
- [`typescript`](./src) contains the TypeScript package that exports the `Status`, `StatusCode` types, and helper functions.
- [`typescript/type-defs`](./type-defs) contains the plain type definitions for `Status`, `StatusCode`, and associated status payloads. These types are defined in TypeScript at the moment but could easily be represented in another schema format.

## Attributions

- This model was heavily inspired by [Google Cloud’s error model](https://cloud.google.com/apis/design/errors)
