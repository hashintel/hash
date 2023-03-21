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

- The propagation of errors purely _within_ a service do not have to conform to the shape of the model defined here. This is a compromise to attempt to maintain idiomatic behaviour within various environments. Therefore `error-stack` can continue to be used consistently in Rust, and TS can throw errors that will be caught in a tight scope when required. However, once a path allows for that error to be propagated through an API, type systems should be used to ensure that all errors in their are defined in a publicly consumable fashion.

## Package Layout

This package is structured into two main areas:

- [`pkg`](./pkg) contains the TypeScript package that exports the `Status`, `StatusCode` types, and helper functions.
- [`crate`](./crate) contains the Rust crate that defines the `Status` and `StatusCode` types.
- [`type-defs`](./type-defs) contains the plain type definitions for `Status`, `StatusCode`, and associated status payloads. These types are defined in TypeScript at the moment but could easily be represented in another schema format.

Note: despite the `type-defs` being in TypeScript, we define them separately to keep a better separation of concerns, and to avoid `quicktype` breaking when it encounters non-type code (e.g. `const` definitions).

## Attributions

- This model was heavily inspired by [Google Cloud’s error model](https://cloud.google.com/apis/design/errors)
