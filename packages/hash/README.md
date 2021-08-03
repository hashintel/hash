# HASH.dev

## Monorepo
In order to work w/ multiple packages in a single repository, they must adhere to some conventions.
Each package should

- have its own workspace
- live on the `@hashintel` namespace
- expose a `lint` script and therefor depend on npm packages (`devDependencies`)
  - `@typescript-eslint`
  - `eslint-config-prettier`
