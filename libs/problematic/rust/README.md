# problematic

Problem details ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) for the errors of an HTTP API, with the public and the internal errors of every endpoint kept apart by the compiler.

A client can act on some errors of an endpoint, such as a missing user. Other errors, such as a failed database query, are internal: the client receives `500 Internal Server Error` and learns nothing about the error. `problematic` defines on three levels which errors a client receives:

- A `ProblemVariant` is one kind of error a client can receive, with its problem type and extension members.
- A `Problem` lists the variants one endpoint answers with, including one for the errors that stay internal.
- `Expose` maps every error of your error type to one of these variants.

Answering with a variant whose problem type the `Problem` does not list fails to compile. A handler returns `Result<_, Rejection<K>>`, and `?` turns its error into the problem details response that `K` allows. With the `aide` feature, the OpenAPI document lists the variants of `K` for the handler. Building the document panics if one of them cannot be documented, or if its status already has a response that documents no variants.

`ProblemDetails` serializes and deserializes problem details objects, borrowing strings from the input where it can, and describes them as JSON Schema.

`problematic` requires a nightly toolchain.

## Features

- `axum`: a `Rejection` is an [axum](https://docs.rs/axum) response.
- `aide`: the OpenAPI document that [aide](https://docs.rs/aide) generates lists the errors of every endpoint.

No features are enabled by default.

## Contributors

[HASH](https://hash.dev/) created and maintains `problematic`. Contributions are welcome. Follow the [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) to contribute. Ask questions in [GitHub Discussions](https://github.com/orgs/hashintel/discussions).

## License

`problematic` is available under either of the [Apache License, Version 2.0] or [MIT license] at your option. Please see the [LICENSE] file for more information.

[Apache License, Version 2.0]: LICENSE-APACHE.md
[MIT license]: LICENSE-MIT.md
[LICENSE]: LICENSE.md
