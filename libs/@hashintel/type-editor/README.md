[block protocol type system]: https://blockprotocol.org/docs/working-with-types?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor
[embedding application]: https://blockprotocol.org/docs/blocks/environments?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor
[hash]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor
[hosted]: https://hash.ai/?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor

# HASH (Entity) Type Editor

A component for editing **entity types** as defined in the [Block Protocol Type System] specification.

## Demo

The type editor is currently in use within [HASH] and can either be tested by:

1. running the application yourself, and clicking the "Create new type" button once logged in; or
1. trying out the [hosted] version of HASH (faster, easier).

## Usage

This package may be consumed under the terms of its [LICENSE](LICENSE.md) by any other protocol-compliant [embedding application].

The type editor exports `react-hook-form` methods which must be used to wrap the component in the required context. See [here](https://github.com/hashintel/hash/blob/12fecc40c71cf21350af50e198d58c8baadaadfc/apps/hash-frontend/src/pages/%5Bshortname%5D/types/entity-type/%5B...slug-maybe-version%5D.page.tsx#L228) for an example.

## Publishing

See [`libs/README.md`](../../README.md#publishing)
