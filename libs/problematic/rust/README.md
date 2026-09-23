# problematic

HTTP Problem Details with typed extension members.

## Features

- `serde` enables serialization and deserialization, including borrowing strings from the input.
- `schemars` enables JSON Schema generation independently of `serde`.
- `aide` documents `ProblemDetails` responses as `application/problem+json` and includes `schemars`.
  Inferred responses use the default response because the HTTP status belongs to each occurrence.
- `error-stack` retrieves problems from error contexts and attachments in frame order and includes `serde`.

No features are enabled by default.

## Contributors

[HASH](https://hash.dev/) created and maintains `problematic`. Contributions are welcome. Follow the [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) to contribute. Ask questions in [GitHub Discussions](https://github.com/orgs/hashintel/discussions).

## License

`problematic` is available under either of the [Apache License, Version 2.0] or [MIT license] at your option. Please see the [LICENSE] file for more information.

[Apache License, Version 2.0]: LICENSE-APACHE.md
[MIT license]: LICENSE-MIT.md
[LICENSE]: LICENSE.md
