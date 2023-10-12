[block protocol]: https://blockprotocol.org/?utm_medium=organic&utm_source=github_readme_hash-repo_libs
[discord]: https://hash.ai/discord?utm_medium=organic&utm_source=github_readme_hash-repo_libs
[hash.ai]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_libs
[HASH website for developers]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_libs
[github_banner]: https://hash.dev/?utm_medium=organic&utm_source=github_readme_hash-repo_libs
[github_star]: https://github.com/hashintel/hash/tree/main/libs#
[hash]: https://github.com/hashintel/hash/tree/main/apps/hash
[antsi]: antsi
[deer]: deer
[error-stack]: error-stack
[sarif]: sarif
[@hashintel/type-editor]: @hashintel/type-editor
[@hashintel/query-editor]: @hashintel/query-editor
[@hashintel/design-system]: @hashintel/design-system
[@hashintel/block-design-system]: @hashintel/block-design-system

[![github_banner](https://hash.ai/cdn-cgi/imagedelivery/EipKtqu98OotgfhvKf6Eew/f4e5e79c-077f-4b30-9170-e25b91286300/github)][github_banner]

[![discord](https://img.shields.io/discord/840573247803097118)][discord] [![github_star](https://img.shields.io/github/stars/hashintel/hash?label=Star%20on%20GitHub&style=social)][github_star]

# Libraries

Contains the source code for software development libraries which HASH has published for general use. Full write-ups of most can be found on the [HASH website for developers], and a summary table is included below for convenience.

## General Libraries

| Directory                 | Language(s) | Publication URL                                              | Docs URL                                                   | Description                                                                                                                                    |
| ------------------------- | ----------- | ------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [antsi]                   | Rust        | [Crates.io](https://crates.io/crates/antsi)                  | [Docs.rs](https://docs.rs/antsi/latest/antsi/)             | Supports coloring Select Graphic Rendition (as defined in ISO 6429) with no external dependencies                                              |
| [deer]                    | Rust        | [Crates.io](https://crates.io/crates/deer)                   | [Docs.rs](https://docs.rs/deer/latest/deer/)               | **Experimental** backend-agnostic deserialization framework, featuring meaningful error messages and context and fail-slow behavior by default |
| [error-stack]             | Rust        | [Crates.io](https://crates.io/crates/error-stack)            | [Docs.rs](https://docs.rs/error-stack/latest/error_stack/) | Context-aware error-handling library that supports arbitrary attached user data                                                                |
| [sarif]                   | Rust        | [Crates.io](https://crates.io/crates/sarif)                  | [Docs.rs](https://docs.rs/sarif/latest/sarif/)             | Representation of the SARIF specification in Rust                                                                                              |
| [@hashintel/type-editor]  | TypeScript  | [npm](https://www.npmjs.com/package/@hashintel/type-editor)  | To be written                                              | UI for editing entity types defined according to the [Block Protocol's Type System](https://blockprotocol.org/docs/working-with-types)         |
| [@hashintel/query-editor] | TypeScript  | [npm](https://www.npmjs.com/package/@hashintel/query-editor) | To be written                                              | UI for editing queries (a specific entity type used heavily inside of [HASH])                                                                  |

## Internal Libraries

Although published to package managers, the following libraries were developed for internal use and may be subject to breaking changes. External consumers should be especially careful when using or upgrading these.

| Directory                        | Language(s) | Publication URL                                                     | Docs URL      | Description                                                                                          |
| -------------------------------- | ----------- | ------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| [@hashintel/design-system]       | TypeScript  | [npm](https://www.npmjs.com/package/@hashintel/design-system)       | To be written | A collection of styleguide-aligned reusable UI primitives for [HASH] and our [hash.ai] website       |
| [@hashintel/block-design-system] | TypeScript  | [npm](https://www.npmjs.com/package/@hashintel/block-design-system) | To be written | A relatively unopinionated set of reusable UI primitives for use in building [Block Protocol] blocks |

## Internal unpublished libraries

The packages inside of [`@local`](./@local) are libraries used inside the repository and are not published to package managers. all of these libraries may be subject to breaking changes. External consumers should be especially careful when using or upgrading these.

The following list is a non-exhaustive list of packages in `@local`:

| Package                                                         | Language(s) | Docs URL      | Description                                                                                                       |
| --------------------------------------------------------------- | ----------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| [@local/codec-rs](@local/codec)                                 | Rust        | Not hosted    | Implementation of different `serde` or byte codes used in HASH                                                    |
| [@local/hash-authorization-rs](@local/hash-authorization)       | Rust        | Not hosted    | Provides the Authorization interface and logic used in the Graph                                                  |
| [@local/hash-graph-client](@local/hash-graph-client/typescript) | Typescript  | To be written | A generator to create a TypeScript/JavaScript client for the Graph API                                            |
| [@local/hash-graph-client-py](@local/hash-graph-client/python)  | Python      | To be written | A generator to create a Python client for the Graph API                                                           |
| [@local/hash-graph-sdk-py](@local/hash-graph-sdk/python)        | Python      | To be written | A High-level interface for the HASH Graph API, providing several convenience methods for interacting with the API |
| [@local/hash-graph-types-rs](@local/hash-graph-types/rust)      | Rust        | Not hosted    | Types used inside of the Graph API                                                                                |
| [@local/hash-graph-types-py](@local/hash-graph-types/python)    | Python      | To be written | Utility library to convert Block Protocol ontology schemas to Python Pydantic models.                             |
| [@local/temporal-versioning-rs](@local/temporal-versioning)     | Rust        | Not hosted    | Implementation of temporal versioning                                                                             |

## Contributing

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md).

## Publishing

### Rust

Publishable Rust crates are automatically published on merge to `main` if their version has been modified.

A crate can be marked as _publishable_ by adding it to the list of `PUBLISH_PATTERNS` in [.github/scripts/rust/setup.py](/.github/scripts/rust/setup.py)

The publishing process is tested automatically, and therefore can be verified through, a dry-run within CI on pull requests.

### TypeScript

Publishing of TypeScript libraries is handled via [Changesets](https://github.com/changesets/changesets).

To record a change for publication:

1. From the root of the repository, run `yarn changeset`
1. Select the package(s) affected by this change (space to select, enter to move to the next step)

- Do not worry about selecting packages which depend on changed packages – Changesets will handle bumping them

1. Select the semver increment
1. Describe the change
1. Commit the created changeset file

When a PR with a changeset file is merged, the change is added to a PR entitled 'Version Packages',
which has a diff showing the version increments which will be applied to affected packages, including dependents.

Once the 'Version Packages' PR is merged, the changes are published to npm.
