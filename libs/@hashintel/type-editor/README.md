[block protocol]: https://blockprotocol.org/?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor
[block protocol type system]: https://blockprotocol.org/docs/working-with-types?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor
[embedding applications]: https://blockprotocol.org/docs/blocks/environments?utm_medium=organic&utm_source=github_readme_hash-repo_type-editor

# HASH (Entity) Type Editor

A UI for editing entity types defined according to the [Block Protocol Type System].

## Usage

The type editor exports `react-hook-form` methods which must be used to wrap the component in the required context.

See [here](https://github.com/hashintel/hash/blob/12fecc40c71cf21350af50e198d58c8baadaadfc/apps/hash-frontend/src/pages/%5Bshortname%5D/types/entity-type/%5B...slug-maybe-version%5D.page.tsx#L228) for an example.

## Development

The type editor is used in the HASH application, and can be tested by running that application and (once logged in) clicking to create a new type. It may also be consumed by other [Block Protocol] [embedding applications].

## Publishing

See [`libs/README.md`](../../README.md#publishing)
