# Petrinaut dependency diagrams

These diagrams are generated from Petrinaut's TypeScript imports with
[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) and laid
out with [D2](https://d2lang.com/) using ELK.

## Project modules

[Open the project dependency diagram](./petrinaut-dependencies.svg).

![Dependencies between Petrinaut modules](./petrinaut-dependencies.svg)

## Compilation and execution path

[Open the focused compilation dependency diagram](./petrinaut-compilation-dependencies.svg).

![Dependencies around the LSP, HIR compilation, and simulation runtimes](./petrinaut-compilation-dependencies.svg)

Regenerate both diagrams from the repository root:

```sh
yarn workspace @hashintel/petrinaut-core doc:dependency-diagram
```

The checked-in `.d2` files are the readable graph sources; the `.svg` files are
generated views. Test and Storybook files are intentionally excluded.
